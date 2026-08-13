// @ts-nocheck
import React from "react";
import { DesktopSetupState, RuntimeStatus } from "@silfable/contracts";
import { Brand, CornerFooter } from "../common/Brand";
import { SetupStepper, SETUP_STEPS } from "./SetupStepper";
import { SecurityStep, ChangePasswordStep } from "./steps/SecurityStep";

export type SetupState = DesktopSetupState;

export function SetupFlow({
  setup,
  runtime,
  save,
  setRuntime,
  editing = false,
  onExit,
  WalletStepComp,
  IntegrationStepComp,
  TuningStepComp,
  ProviderStepComp,
  ReviewStepComp,
}: {
  setup: SetupState;
  runtime: RuntimeStatus | null;
  save: (next: SetupState) => void;
  setRuntime: (runtime: RuntimeStatus) => void;
  editing?: boolean;
  onExit?: (() => void) | undefined;
  WalletStepComp: React.ComponentType<any>;
  IntegrationStepComp: React.ComponentType<any>;
  TuningStepComp: React.ComponentType<any>;
  ProviderStepComp: React.ComponentType<any>;
  ReviewStepComp: React.ComponentType<any>;
}) {
  const index = Math.max(0, setup.step - 1);

  function next(patch: Partial<SetupState> = {}): void {
    save({
      ...setup,
      ...patch,
      step: editing ? 6 : Math.min(6, setup.step + 1),
    });
  }

  function back(): void {
    save({ ...setup, step: editing ? 6 : Math.max(1, setup.step - 1) });
  }

  function edit(step: number): void {
    save({ ...setup, step });
  }

  const editingLabel = SETUP_STEPS[setup.step - 1] ?? "Setup";

  return (
    <main className="setupPage">
      <Brand compact />
      <SetupStepper current={index} />
      {editing && setup.step !== 6 && (
        <div className="editingBar">
          <span>Editing · {editingLabel}</span>
          <button type="button" onClick={() => edit(6)}>← Return to review</button>
        </div>
      )}
      {setup.step === 1 &&
        (runtime?.masterPassword === "configured" ? (
          <ChangePasswordStep
            onContinue={() => next({ passwordConfigured: true })}
          />
        ) : (
          <SecurityStep
            runtime={runtime}
            onConfigured={(nextRuntime) => {
              setRuntime(nextRuntime);
              next({ passwordConfigured: true });
            }}
          />
        ))}
      {setup.step === 2 && (
        <WalletStepComp
          runtime={runtime}
          setRuntime={setRuntime}
          onBack={back}
          onContinue={(skipped: boolean) => next({ walletSkipped: skipped })}
        />
      )}
      {setup.step === 3 && (
        <IntegrationStepComp
          setup={setup}
          onBack={back}
          onContinue={(values: any) => next(values)}
        />
      )}
      {setup.step === 4 && (
        <TuningStepComp
          setup={setup}
          onBack={back}
          onContinue={(values: any) => next({ ...values, tuningConfigured: true })}
        />
      )}
      {setup.step === 5 && (
        <ProviderStepComp
          setup={setup}
          onBack={back}
          onContinue={(model: string) =>
            next({ providerConfigured: true, providerModel: model })
          }
        />
      )}
      {setup.step === 6 && (
        <ReviewStepComp
          setup={setup}
          runtime={runtime}
          edit={edit}
          onBack={back}
          onFinalize={async () => {
            const finalizedSetup = { ...setup, complete: true, step: 6 } satisfies SetupState;
            await window.silfable.finalizeSetup({
              schemaVersion: 1,
              requestId: crypto.randomUUID(),
              acknowledgedRestrictedMainnet: true,
              setup: finalizedSetup,
            });
            save(finalizedSetup);
          }}
          editing={editing}
          onExit={onExit}
        />
      )}
      <CornerFooter />
    </main>
  );
}
