import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, UserCheck } from 'lucide-react';
import api from '../api/client';

const emptyForm = { name: '', department: '', phone: '' };

export default function HostDirectory({ onToast }) {
  const [hosts, setHosts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await api.get('/host/staff');
    setHosts(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    load().catch(() => onToast?.('Could not load hosts', true));
  }, []);

  function startEdit(host) {
    setEditingId(host.id);
    setForm({
      name: host.name || '',
      department: host.department || host.dept || '',
      phone: host.phone || '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function save(e) {
    e?.preventDefault();
    if (!form.name.trim() || !form.department.trim() || !form.phone.trim()) {
      onToast?.('Add name, department, and WhatsApp number', true);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        department: form.department.trim(),
        phone: form.phone.trim(),
      };
      if (editingId) await api.patch(`/host/staff/${editingId}`, payload);
      else await api.post('/host/staff', payload);
      cancelEdit();
      await load();
      onToast?.(editingId ? 'Host updated' : 'Host saved');
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not save host', true);
    } finally {
      setBusy(false);
    }
  }

  async function remove(host) {
    if (!window.confirm(`Remove ${host.name}? Visitors will no longer be able to book this host.`)) return;
    setBusy(true);
    try {
      await api.delete(`/host/staff/${host.id}`);
      if (editingId === host.id) cancelEdit();
      await load();
      onToast?.('Host removed');
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not delete host', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ap-panel">
      <div className="ap-panel-head">
        <div className="ap-panel-title">
          <span className="ap-panel-ic">
            <UserCheck size={16} strokeWidth={2} />
          </span>
          <div>
            <h3>Company hosts</h3>
            <p>Save each host&apos;s personal WhatsApp number. The company number sends APPROVE / REJECT there — do not use the company number as the host phone.</p>
          </div>
        </div>
        <span className="ap-badge active">{hosts.length} hosts</span>
      </div>

      <form className="kb-body" onSubmit={save}>
        <div className="ap-profile-grid" style={{ padding: 0 }}>
          <div className="ap-f-field">
            <label htmlFor="hostName">Host name</label>
            <input
              id="hostName"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Boikarabelo Ramaretlwa"
            />
          </div>
          <div className="ap-f-field">
            <label htmlFor="hostDept">Department / info</label>
            <input
              id="hostDept"
              value={form.department}
              onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              placeholder="Technology Planning"
            />
          </div>
          <div className="ap-f-field">
            <label htmlFor="hostPhone">Personal WhatsApp number</label>
            <input
              id="hostPhone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+267 71 000 001"
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="ap-btn ap-btn-teal" type="submit" disabled={busy}>
            <Plus size={14} /> {editingId ? 'Update host' : 'Save host'}
          </button>
          {editingId ? (
            <button className="ap-btn ap-btn-ghost" type="button" disabled={busy} onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <div className="ap-table-wrap">
        <table className="ap-table">
          <thead>
            <tr>
              <th>Host</th>
              <th>Department</th>
              <th>WhatsApp</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {hosts.length ? (
              hosts.map((h) => (
                <tr key={h.id}>
                  <td className="ap-cell-main">{h.name}</td>
                  <td>{h.department || h.dept || '—'}</td>
                  <td>{h.phone ? (String(h.phone).startsWith('+') ? h.phone : `+${String(h.phone).replace(/\D/g, '')}`) : '—'}</td>
                  <td>
                    <span className={'ap-badge ' + (h.status === 'active' ? 'approved' : 'rejected')}>{h.status}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="ap-btn ap-btn-ghost ap-btn-sm" type="button" disabled={busy} onClick={() => startEdit(h)}>
                        <Pencil size={13} /> Edit
                      </button>
                      <button className="ap-btn ap-btn-danger ap-btn-sm" type="button" disabled={busy} onClick={() => remove(h)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="ap-empty">
                  No hosts yet. Add the first staff record above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
