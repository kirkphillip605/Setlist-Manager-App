import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { apiGet, apiPatch } from '@/lib/apiFetch';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { LoadingDialog } from '@/components/LoadingDialog';
import { formatDistanceToNow } from 'date-fns';

type PlatformRole = 'user' | 'platform_admin' | 'platform_support';

interface AdminUser {
  id:           string;
  email:        string;
  firstName:    string;
  lastName:     string;
  platformRole: PlatformRole;
  isActive:     boolean;
  createdAt:    string;
}

const ROLE_LABELS: Record<PlatformRole, string> = {
  user:             'User',
  platform_admin:   'Admin',
  platform_support: 'Support',
};

const ROLE_BADGE: Record<PlatformRole, 'default' | 'secondary' | 'outline'> = {
  user:             'outline',
  platform_admin:   'default',
  platform_support: 'secondary',
};

const AdminUsers = () => {
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [processing, setProcessing] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await apiGet<AdminUser[]>('/api/users');
      setUsers(data ?? []);
    } catch (err: any) {
      toast.error('Failed to load users: ' + (err?.message ?? 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleUpdateRole = async (userId: string, role: PlatformRole) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, platformRole: role } : u));
    try {
      await apiPatch(`/api/users/${userId}`, { platform_role: role });
      toast.success('Role updated');
    } catch (err: any) {
      toast.error('Update failed: ' + (err?.message ?? 'Unknown'));
      fetchUsers(); // revert
    }
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive } : u));
    try {
      await apiPatch(`/api/users/${userId}`, { is_active: isActive });
      toast.success(isActive ? 'User activated' : 'User deactivated');
    } catch (err: any) {
      toast.error('Update failed: ' + (err?.message ?? 'Unknown'));
      fetchUsers();
    }
  };

  const activeUsers   = users.filter(u => u.isActive);
  const inactiveUsers = users.filter(u => !u.isActive);

  const UserTable = ({ list }: { list: AdminUser[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Platform Role</TableHead>
          <TableHead>Active</TableHead>
          <TableHead>Joined</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.length === 0 && (
          <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No users found.</TableCell></TableRow>
        )}
        {list.map(user => (
          <TableRow key={user.id}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{user.firstName} {user.lastName}</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Badge variant={ROLE_BADGE[user.platformRole]}>{ROLE_LABELS[user.platformRole]}</Badge>
                <Select value={user.platformRole} onValueChange={(v) => handleUpdateRole(user.id, v as PlatformRole)}>
                  <SelectTrigger className="w-[120px] h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="platform_support">Support</SelectItem>
                    <SelectItem value="platform_admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TableCell>
            <TableCell>
              <Switch
                checked={user.isActive}
                onCheckedChange={val => handleToggleActive(user.id, val)}
              />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <AppLayout>
      <LoadingDialog open={processing} message="Processing..." />
      <div className="space-y-6 pb-20">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Platform Users</h1>
            <p className="text-muted-foreground">Manage platform roles and account access.</p>
          </div>
          <Button variant="outline" onClick={fetchUsers} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Active Users ({activeUsers.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <UserTable list={activeUsers} />
              </CardContent>
            </Card>

            {inactiveUsers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Deactivated Users ({inactiveUsers.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <UserTable list={inactiveUsers} />
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default AdminUsers;
