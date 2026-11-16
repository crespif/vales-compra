import { EstadoVale as E } from '../database/entities';
import { estaVencido, hoyISO, puedeTransicionar, sumarDias } from './estados';

describe('estados del vale', () => {
  it('sigue el circuito principal', () => {
    const camino = [E.BORRADOR, E.SOLICITADO, E.APROBADO, E.EMITIDO, E.ENTREGADO, E.CONCILIADO];
    for (let i = 0; i < camino.length - 1; i++) expect(puedeTransicionar(camino[i], camino[i + 1])).toBe(true);
  });
  it('no permite saltear la aprobación ni anular después de la entrega', () => {
    expect(puedeTransicionar(E.SOLICITADO, E.EMITIDO)).toBe(false);
    expect(puedeTransicionar(E.ENTREGADO, E.ANULADO)).toBe(false);
    expect(puedeTransicionar(E.CONCILIADO, E.ANULADO)).toBe(false);
  });
  it('los estados finales no tienen salida', () => {
    for (const fin of [E.CONCILIADO, E.RECHAZADO, E.ANULADO]) {
      for (const otro of Object.values(E)) expect(puedeTransicionar(fin, otro)).toBe(false);
    }
  });
  it('calcula vencimiento y fechas', () => {
    expect(sumarDias('2026-12-30', 7)).toBe('2027-01-06');
    expect(estaVencido(E.EMITIDO, '2026-11-09', '2026-11-10')).toBe(true);
    expect(estaVencido(E.EMITIDO, '2026-11-10', '2026-11-10')).toBe(false);
    expect(estaVencido(E.ENTREGADO, '2026-01-01', '2026-11-10')).toBe(false);
    expect(hoyISO(new Date('2026-11-10T02:00:00Z'))).toBe('2026-11-09'); // 23 h en Argentina
  });
});
