import { EventEmitter } from "node:events";
import type { RuntimeDatabase } from "../storage/database.js";

export type CreateDcaScheduleInput = {
  id: string;
  mintAddress: string;
  totalBudgetLamports: string;
  orderAmountLamports: string;
  intervalSeconds: number;
};

export type DcaOrderTriggerEvent = {
  scheduleId: string;
  mintAddress: string;
  orderAmountLamports: string;
  /** Number of confirmed executions before this reviewable proposal. */
  executedCount: number;
  triggeredAt: string;
};

export class DcaSchedulerManager extends EventEmitter {
  readonly #db: RuntimeDatabase;

  constructor(db: RuntimeDatabase) {
    super();
    this.#db = db;
  }

  createSchedule(input: CreateDcaScheduleInput): void {
    if (!/^[1-9]\d*$/u.test(input.totalBudgetLamports)) throw new Error("Invalid DCA total budget");
    if (!/^[1-9]\d*$/u.test(input.orderAmountLamports)) throw new Error("Invalid DCA order amount");
    if (BigInt(input.orderAmountLamports) > BigInt(input.totalBudgetLamports)) throw new Error("Order amount exceeds total budget");
    if (!Number.isInteger(input.intervalSeconds) || input.intervalSeconds < 1) throw new Error("Invalid DCA interval");

    const now = new Date();
    const firstExecution = new Date(now.getTime() + input.intervalSeconds * 1000).toISOString();

    this.#db.upsertDcaSchedule({
      id: input.id,
      mintAddress: input.mintAddress,
      totalBudgetLamports: input.totalBudgetLamports,
      orderAmountLamports: input.orderAmountLamports,
      intervalSeconds: input.intervalSeconds,
      executedCount: 0,
      totalExecutedLamports: "0",
      nextExecutionAt: firstExecution,
      status: "ACTIVE",
    });
  }

  cancelSchedule(id: string): void {
    const schedules = this.#db.listDcaSchedules().filter((s) => s.id === id);
    if (schedules.length === 0) return;
    const sched = schedules[0];
    if (sched === undefined) return;
    this.#db.upsertDcaSchedule({
      ...sched,
      status: "CANCELLED",
    });
  }

  getActiveSchedules() {
    return this.#db.listDcaSchedules().filter((s) => s.status === "ACTIVE");
  }

  evaluateDcaSchedules(nowOverride?: Date): DcaOrderTriggerEvent[] {
    const now = nowOverride ?? new Date();
    const activeSchedules = this.getActiveSchedules();
    const triggeredEvents: DcaOrderTriggerEvent[] = [];

    for (const schedule of activeSchedules) {
      const scheduledTime = new Date(schedule.nextExecutionAt);
      if (now >= scheduledTime) {
        const orderAmountBig = BigInt(schedule.orderAmountLamports);
        const currentExecutedBig = BigInt(schedule.totalExecutedLamports);
        const totalBudgetBig = BigInt(schedule.totalBudgetLamports);

        if (currentExecutedBig + orderAmountBig > totalBudgetBig) {
          this.#db.upsertDcaSchedule({ ...schedule, status: "COMPLETED", nextExecutionAt: "COMPLETED" });
          continue;
        }
        const nextTime = new Date(now.getTime() + schedule.intervalSeconds * 1000).toISOString();

        this.#db.upsertDcaSchedule({
          ...schedule,
          // A scheduler tick is not evidence of a swap. Only a finalized
          // venue receipt may increment executedCount/totalExecutedLamports.
          nextExecutionAt: nextTime,
          status: "ACTIVE",
        });

        const triggerEvent: DcaOrderTriggerEvent = {
          scheduleId: schedule.id,
          mintAddress: schedule.mintAddress,
          orderAmountLamports: schedule.orderAmountLamports,
          executedCount: schedule.executedCount,
          triggeredAt: now.toISOString(),
        };

        triggeredEvents.push(triggerEvent);
        this.emit("dca_proposal_due", triggerEvent);
      }
    }

    return triggeredEvents;
  }
}
