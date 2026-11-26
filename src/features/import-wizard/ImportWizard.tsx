import { useEffect, useRef } from 'react';
import { Stepper } from './components/Stepper';
import { Icon } from '../../ui/primitives';
import { PageHeader } from '../../ui/PageHeader';
import { CompleteStep } from './steps/CompleteStep';
import { MapPropertiesStep } from './steps/MapPropertiesStep';
import { SelectDatabaseStep } from './steps/SelectDatabaseStep';
import { ValidateStep } from './steps/ValidateStep';
import { useImportWizard, type ImportServices } from './useImportWizard';

export function ImportWizard({ services }: { services: ImportServices }) {
  const wizard = useImportWizard(services);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start' });
  }, [wizard.step]);

  return (
    <div className="wizard" ref={top}>
      <PageHeader
        title={`Import from ${services.connector.label}`}
        description="Connect a trade database, match its properties to Tradelens fields and review the data before importing."
        actions={<Stepper step={wizard.step} />}
      />

      {wizard.error && wizard.step !== 'validate' && (
        <div className="callout callout--negative">
          <Icon name="alert" /> {wizard.error}
        </div>
      )}

      <div className="wizard__body">
        {wizard.step === 'select' && <SelectDatabaseStep wizard={wizard} />}
        {wizard.step === 'map' && <MapPropertiesStep wizard={wizard} />}
        {wizard.step === 'validate' && <ValidateStep wizard={wizard} />}
        {wizard.step === 'done' && <CompleteStep wizard={wizard} />}
      </div>
    </div>
  );
}
