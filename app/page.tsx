import Workspace from './workspace';
import { session } from '@/lib/auth';
import Login from './login';
export const dynamic = 'force-dynamic';
export default async function Page() { if(!await session())return <Login />; return <Workspace />; }
