import { createContext, useContext } from 'react';
import { Sesion } from './api';

export const SesionCtx = createContext<{ usuario: Sesion; salir: () => void } | null>(null);
export const useSesion = () => useContext(SesionCtx)!;
export const esCompras = (u: Sesion) => u.rol === 'COMPRAS' || u.rol === 'ADMIN';
