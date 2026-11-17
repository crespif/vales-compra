import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Item, Proveedor, Vale } from '../api';
import { ProveedorPicker } from '../ProveedorPicker';
import { BarraFija, ErrorMsg, Girando, useAccion } from '../ui';

export type ItemForm = { cantidad: string; unidad: string; descripcion: string };
export const itemVacio = (): ItemForm => ({ cantidad: '1', unidad: '', descripcion: '' });
export const aForm = (i: Item): ItemForm => ({ cantidad: String(i.cantidad), unidad: i.unidad ?? '', descripcion: i.descripcion });

/** Convierte el formulario en ítems para la API; descarta renglones vacíos. */
export function aItems(items: ItemForm[]) {
  return items
    .filter((i) => i.descripcion.trim())
    .map((i) => ({
      cantidad: Number(i.cantidad.replace(',', '.')),
      unidad: i.unidad.trim() || undefined,
      descripcion: i.descripcion.trim(),
    }));
}

export function ItemsEditor({ items, onChange }: { items: ItemForm[]; onChange: (i: ItemForm[]) => void }) {
  const set = (idx: number, campo: keyof ItemForm, valor: string) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  return (
    <div>
      <div className="item-editor muted" aria-hidden>
        <span>Cant.</span>
        <span>Unidad</span>
        <span>Producto</span>
        <span />
      </div>
      {items.map((it, idx) => (
        <div className="item-editor" key={idx}>
          <input aria-label="Cantidad" inputMode="decimal" value={it.cantidad} onChange={(e) => set(idx, 'cantidad', e.target.value)} />
          <input aria-label="Unidad" placeholder="u." value={it.unidad} onChange={(e) => set(idx, 'unidad', e.target.value)} />
          <input aria-label="Producto" placeholder="Ej.: cable 2x2,5" value={it.descripcion} onChange={(e) => set(idx, 'descripcion', e.target.value)} />
          <button type="button" className="icono" aria-label="Quitar renglón" disabled={items.length === 1} onClick={() => onChange(items.filter((_, i) => i !== idx))}>
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, itemVacio()])}>
        + Agregar producto
      </button>
    </div>
  );
}

export function NuevoVale() {
  const nav = useNavigate();
  const [items, setItems] = useState<ItemForm[]>([itemVacio()]);
  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [observaciones, setObservaciones] = useState('');
  const { ocupado, error, setError, ejecutar } = useAccion();

  async function guardar(enviar: boolean) {
    const lista = aItems(items);
    if (!lista.length) return setError(new Error('Agregá al menos un producto'));
    if (lista.some((i) => !(i.cantidad > 0))) return setError(new Error('Revisá las cantidades'));
    const v = await ejecutar(() =>
      api.post<Vale>('/vales', {
        items: lista,
        proveedorId: proveedor?.id,
        observaciones: observaciones.trim() || undefined,
        enviar,
      }),
    );
    if (v) nav(`/vales/${v.id}`, { state: { aviso: enviar ? 'Pedido enviado a Compras.' : 'Borrador guardado.' } });
  }

  return (
    <>
      <h1>Nuevo pedido</h1>
      <p className="muted">Compras lo revisa, define el proveedor y emite el vale. Te avisamos acá cuando esté listo para retirar.</p>
      <br />
      <ErrorMsg error={error} />
      <div className="card">
        <h2>¿Qué necesitás?</h2>
        <ItemsEditor items={items} onChange={setItems} />
      </div>
      <div className="card">
        <ProveedorPicker etiqueta="Proveedor sugerido" opcional valor={proveedor} onChange={setProveedor} />
        <label style={{ marginBottom: 0 }}>
          Observaciones (opcional)
          <textarea maxLength={500} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Para qué es, urgencia, marca preferida…" />
        </label>
      </div>
      <BarraFija>
        <button onClick={() => guardar(false)} disabled={ocupado}>
          Guardar borrador
        </button>
        <button className="primario" onClick={() => guardar(true)} disabled={ocupado}>
          {ocupado ? (
            <>
              <Girando /> Enviando…
            </>
          ) : (
            'Enviar a Compras'
          )}
        </button>
      </BarraFija>
    </>
  );
}
