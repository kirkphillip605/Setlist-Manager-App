import { useState } from 'react';
import { sendBandInvitations } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Mail, Phone, Plus, X, Send } from 'lucide-react';
import { toast } from 'sonner';

interface InviteMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bandId: string;
  onInvitesSent?: () => void;
}

type InviteEntry = { type: 'email'; value: string } | { type: 'phone'; value: string };

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\+?[\d\s\-().]{7,20}$/;

const InviteMembersDialog = ({ open, onOpenChange, bandId, onInvitesSent }: InviteMembersDialogProps) => {
  const [entries, setEntries] = useState<InviteEntry[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [inputType, setInputType] = useState<'email' | 'phone'>('email');
  const [sending, setSending] = useState(false);

  const addEntry = () => {
    const val = inputValue.trim();
    if (!val) return;

    if (inputType === 'email') {
      if (!emailRegex.test(val)) {
        toast.error('Please enter a valid email address');
        return;
      }
      if (entries.some(e => e.type === 'email' && e.value.toLowerCase() === val.toLowerCase())) {
        toast.error('Email already added');
        return;
      }
      setEntries([...entries, { type: 'email', value: val.toLowerCase() }]);
    } else {
      if (!phoneRegex.test(val)) {
        toast.error('Please enter a valid phone number');
        return;
      }
      if (entries.some(e => e.type === 'phone' && e.value === val)) {
        toast.error('Phone number already added');
        return;
      }
      setEntries([...entries, { type: 'phone', value: val }]);
    }
    setInputValue('');
  };

  const removeEntry = (index: number) => {
    setEntries(entries.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addEntry();
    }
  };

  const handleSend = async () => {
    if (entries.length === 0) {
      toast.error('Add at least one email or phone number');
      return;
    }

    setSending(true);
    try {
      const invites = entries.map(e =>
        e.type === 'email' ? { email: e.value } : { phone: e.value }
      );
      const res = await sendBandInvitations(bandId, invites);

      const sent = res.results.filter(r => r.status.startsWith('invited'));
      const alreadyInvited = res.results.filter(r => r.status === 'already_invited');
      const alreadyMember = res.results.filter(r => r.status === 'already_member');

      if (sent.length > 0) {
        toast.success(`${sent.length} invitation${sent.length > 1 ? 's' : ''} sent`);
      }
      if (alreadyInvited.length > 0) {
        toast.info(`${alreadyInvited.length} already had pending invitations`);
      }
      if (alreadyMember.length > 0) {
        toast.info(`${alreadyMember.length} already in the band`);
      }

      setEntries([]);
      setInputValue('');
      onOpenChange(false);
      onInvitesSent?.();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send invitations');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Members</DialogTitle>
          <DialogDescription>
            Enter email addresses or phone numbers to invite musicians to your band.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={inputType === 'email' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setInputType('email')}
            >
              <Mail className="h-3.5 w-3.5 mr-1" /> Email
            </Button>
            <Button
              type="button"
              variant={inputType === 'phone' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setInputType('phone')}
            >
              <Phone className="h-3.5 w-3.5 mr-1" /> Phone
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="invite-input">
              {inputType === 'email' ? 'Email Address' : 'Phone Number'}
            </Label>
            <div className="flex gap-2">
              <Input
                id="invite-input"
                type={inputType === 'email' ? 'email' : 'tel'}
                placeholder={inputType === 'email' ? 'musician@example.com' : '+1 (555) 123-4567'}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <Button type="button" variant="outline" size="icon" onClick={addEntry} disabled={!inputValue.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {entries.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                {entries.length} recipient{entries.length > 1 ? 's' : ''}
              </Label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {entries.map((entry, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 pr-1">
                    {entry.type === 'email' ? (
                      <Mail className="h-3 w-3" />
                    ) : (
                      <Phone className="h-3 w-3" />
                    )}
                    <span className="text-xs max-w-[180px] truncate">{entry.value}</span>
                    <button
                      onClick={() => removeEntry(i)}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending || entries.length === 0}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send {entries.length > 0 ? `(${entries.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InviteMembersDialog;
