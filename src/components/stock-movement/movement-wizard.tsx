'use client';
import { ArrowDownToLine, ArrowRightLeft, Truck, Scissors, Layers, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { UserPublic } from '@/types';

type MovementType = 'INWARD' | 'TRANSFER' | 'DISPATCH' | 'REPACK_OUT' | 'REPACK_IN';

interface WizardStep {
  step: number;
  label: string;
}

interface FormData {
  fromStore: string;
  toStore: string;
  type: string;
  variety: string;
  packing: string;
  grade: string;
  qty: number;
  remarks: string;
  changeReason: string;
}

interface MasterData {
  varieties: string[];
  grades: string[];
  packings: string[];
  types: string[];
  coldStores: string[];
}

interface MovementWizardProps {
  showModal: boolean;
  onClose: () => void;
  movementType: MovementType;
  isEditMode: boolean;
  wizardStep: number;
  setWizardStep: (step: number) => void;
  maxSteps: number;
  wizardSteps: WizardStep[];
  isStepValid: (step: number) => boolean;
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  masterData: MasterData | null;
  user: UserPublic | null;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}

const typeIcons: Record<MovementType, typeof ArrowDownToLine> = {
  INWARD: ArrowDownToLine,
  TRANSFER: ArrowRightLeft,
  DISPATCH: Truck,
  REPACK_OUT: Scissors,
  REPACK_IN: Layers,
};

const typeColors: Record<MovementType, string> = {
  INWARD: 'text-emerald-500',
  TRANSFER: 'text-sky-500',
  DISPATCH: 'text-amber-500',
  REPACK_OUT: 'text-indigo-500',
  REPACK_IN: 'text-purple-500',
};

export function MovementWizard({
  showModal,
  onClose,
  movementType,
  isEditMode,
  wizardStep,
  setWizardStep,
  maxSteps,
  wizardSteps,
  isStepValid,
  submitting,
  onSubmit,
  user,
  children,
}: MovementWizardProps) {
  if (!showModal) return null;

  const Icon = typeIcons[movementType];

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="min-h-full flex items-center justify-center p-4">
        <Card className="w-full max-w-4xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 border-border/50 bg-background/95 backdrop-blur-xl my-8" onClick={(e) => e.stopPropagation()}>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-2 h-14">
            <CardTitle className="text-lg flex items-center gap-2">
              <Icon className={typeColors[movementType]} />
              {isEditMode ? 'Edit ' : ''}{movementType.replace('_', ' ')} Request
            </CardTitle>
            <Button onClick={onClose} variant="ghost" size="icon" className="rounded-full">
              <X size={20} />
            </Button>
          </CardHeader>
          <CardContent className="p-6">
            {/* Wizard Steps Indicator */}
            <div className="flex items-center justify-center mb-6">
              {wizardSteps.map((s, idx) => (
                <div key={s.step} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (s.step < wizardStep || isStepValid(s.step - 1)) {
                        setWizardStep(s.step);
                      }
                    }}
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold border transition-all ${
                      wizardStep === s.step
                        ? 'bg-primary border-primary text-white shadow-md shadow-primary/20 shadow-sm'
                        : wizardStep > s.step
                        ? 'bg-primary/10 border-primary/25 text-primary'
                        : 'bg-background border-border text-muted-foreground hover:border-slate-300'
                    }`}
                  >
                    {s.step}
                  </button>
                  <span className={`text-xs ml-2 font-medium hidden sm:inline ${wizardStep === s.step ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                    {s.label}
                  </span>
                  {idx < wizardSteps.length - 1 && <div className={`w-8 sm:w-16 h-[2px] mx-2 ${wizardStep > s.step ? 'bg-primary' : 'bg-border'}`} />}
                </div>
              ))}
            </div>

            <form
              id="movement-form"
              onSubmit={onSubmit}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
            >
              {children}
            </form>

            {/* Wizard Controls Footer */}
            <div className="flex justify-between items-center mt-6 pt-4 border-t border-border/40">
              <div>
                {wizardStep > 1 && (
                  <Button type="button" onClick={() => setWizardStep(wizardStep - 1)} variant="outline" className="h-10">
                    Back
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={onClose} variant="secondary" className="h-10">
                  Cancel
                </Button>
                {wizardStep < maxSteps && (
                  <Button
                    key="next-btn"
                    type="button"
                    onClick={() => setWizardStep(wizardStep + 1)}
                    disabled={!isStepValid(wizardStep)}
                    className="bg-primary hover:bg-primary/90 h-10"
                  >
                    Next
                  </Button>
                )}
                {wizardStep >= maxSteps && (
                  <Button
                    key="submit-btn"
                    type="submit"
                    form="movement-form"
                    disabled={submitting}
                    className="bg-primary hover:bg-primary/90 h-10"
                  >
                    {submitting ? 'Submitting...' : isEditMode ? 'Update Request' : `Submit ${user?.role === 'operator' ? 'Request' : ''}`}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
