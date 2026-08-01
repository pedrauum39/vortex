import { redirect } from 'next/navigation';
import { exigirRep } from '@/lib/auth';
import { AdminNav } from './admin-nav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const rep = await exigirRep();
  // Defesa em profundidade: o RLS já bloqueia no banco, isto bloqueia na tela.
  if (rep.role !== 'admin') redirect('/');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-texto-fraco">
          Caixa de areia — crie e apague turnos, simule ponto e statement, edite reps e modelos.
        </p>
      </div>

      <AdminNav />

      {children}
    </div>
  );
}
