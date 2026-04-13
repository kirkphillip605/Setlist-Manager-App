import { useState } from 'react';
import { useBand } from '@/context/BandContext';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Music2, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BandSwitcherProps {
  variant: 'header' | 'sidebar';
  collapsed?: boolean;
}

export const BandSwitcher = ({ variant, collapsed }: BandSwitcherProps) => {
  const { bands, activeBand, activeBandId, setActiveBand } = useBand();
  const [showDialog, setShowDialog] = useState(false);
  const [confirmBandId, setConfirmBandId] = useState<string | null>(null);

  if (bands.length <= 1) return null;

  const handleSelectBand = (bandId: string) => {
    if (bandId === activeBandId) return;
    setConfirmBandId(bandId);
  };

  const handleConfirmSwitch = () => {
    if (confirmBandId) {
      setActiveBand(confirmBandId);
      setConfirmBandId(null);
      setShowDialog(false);
      setTimeout(() => { window.location.href = '/'; }, 100);
    }
  };

  const confirmBand = bands.find(b => b.id === confirmBandId);

  if (variant === 'sidebar' && collapsed) {
    return (
      <>
        <button
          onClick={() => setShowDialog(true)}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-accent/50 transition-colors"
          title="Switch Band"
        >
          <Music2 className="h-5 w-5 text-primary" />
        </button>
        {renderDialogAndConfirm()}
      </>
    );
  }

  if (variant === 'sidebar') {
    return (
      <>
        <button
          onClick={() => setShowDialog(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent/50 transition-colors text-left"
        >
          <Music2 className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate flex-1">{activeBand?.name ?? 'Select Band'}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
        {renderDialogAndConfirm()}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent/50 transition-colors min-w-0"
      >
        <span className="text-xs text-muted-foreground truncate max-w-[120px] leading-tight">{activeBand?.name}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
      </button>
      {renderDialogAndConfirm()}
    </>
  );

  function renderDialogAndConfirm() {
    return (
      <>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Switch Band</DialogTitle>
              <DialogDescription>Select which band you want to work with.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2 max-h-[300px] overflow-y-auto">
              {bands.map(b => (
                <button
                  key={b.id}
                  disabled={b.id === activeBandId}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 border rounded-lg text-left transition-colors",
                    b.id === activeBandId
                      ? "border-primary bg-primary/5 opacity-75 cursor-default"
                      : "hover:bg-accent cursor-pointer"
                  )}
                  onClick={() => handleSelectBand(b.id)}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {b.name[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{b.name}</p>
                    {b.description && (
                      <p className="text-xs text-muted-foreground truncate">{b.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground capitalize">{b.membership?.role}</p>
                  </div>
                  {b.id === activeBandId && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!confirmBandId} onOpenChange={o => !o && setConfirmBandId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Switch Band?</AlertDialogTitle>
              <AlertDialogDescription>
                Switch to <strong>{confirmBand?.name}</strong>? The page will reload to load the new band's data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmSwitch}>Switch</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }
};
