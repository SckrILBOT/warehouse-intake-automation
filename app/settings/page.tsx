import { redirect } from 'next/navigation';
import { session } from '@/lib/auth';
import PasswordSettings from './password-settings';
export const dynamic='force-dynamic';
export default async function Settings(){if(!await session())redirect('/');return <PasswordSettings/>;}
