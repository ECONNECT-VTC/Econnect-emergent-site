import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';

const AdminDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/admin/financial/invoices`, { withCredentials: true });
        setDocuments(response.data || []);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, []);

  const filtered = useMemo(() => {
    if (tab === 'all') return documents;
    return documents.filter((doc) => doc.type === tab);
  }, [documents, tab]);

  const downloadDocument = (doc) => {
    const path = doc.type === 'order'
      ? `/api/admin/orders/${doc.booking_id}/pdf`
      : `/api/admin/invoices/${doc.booking_id}/pdf`;
    window.open(`${API_URL}${path}`, '_blank');
  };

  return (
    <div className="bg-[#0A0A0A] text-white min-h-full">
      <div className="flex gap-2 mb-6">
        {[
          ['all', 'Tous'],
          ['invoice', 'Factures'],
          ['order', 'Bons de commande']
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`px-4 py-2 rounded ${tab === value ? 'bg-[#D4AF37] text-[#0A0A0A]' : 'bg-[#141414] text-[#A1A1AA]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-[#141414] rounded-xl border border-white/10 p-5 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left text-[#A1A1AA] border-b border-white/10">
              <th className="py-3">N° Document</th>
              <th>Type</th>
              <th>Client</th>
              <th>Course</th>
              <th>Montant TTC</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.map((doc) => (
              <tr key={doc.id} className="border-b border-white/5">
                <td className="py-3">{doc.invoice_number}</td>
                <td>{doc.type === 'order' ? 'BDC' : 'Facture'}</td>
                <td>{doc.client_name}</td>
                <td>{doc.booking_id}</td>
                <td>{Number(doc.amount_ttc || 0).toFixed(2)}€</td>
                <td>{new Date(doc.created_at).toLocaleString()}</td>
                <td>
                  <button
                    onClick={() => downloadDocument(doc)}
                    className="px-3 py-1 rounded bg-[#D4AF37] text-[#0A0A0A]"
                  >
                    📥 Télécharger PDF
                  </button>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#A1A1AA]">Aucun document</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#A1A1AA]">Chargement...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDocuments;
