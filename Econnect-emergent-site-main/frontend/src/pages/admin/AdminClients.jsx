import { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import { Users, Envelope, Phone, Calendar } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AdminClients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/admin/clients`, { withCredentials: true });
        setClients(response.data);
      } catch (error) { console.error('Error:', error); }
      finally { setLoading(false); }
    };
    fetchClients();
  }, []);

  return (
    <DashboardLayout title="Gestion des Clients">
      <div className="mb-6">
        <p className="text-[#A1A1AA]">{clients.length} client(s) inscrits</p>
      </div>

      {loading ? <div className="text-center py-12 text-[#A1A1AA]">Chargement...</div> : clients.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center"><Users size={48} className="text-[#A1A1AA] mx-auto mb-4" /><p className="text-[#A1A1AA]">Aucun client</p></div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="clients-list">
          {clients.map((client) => (
            <div key={client.id} className="glass rounded-xl p-6">
              <h3 className="font-bold text-lg mb-4">{client.name}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-[#A1A1AA]"><Envelope size={16} />{client.email}</div>
                {client.phone && <div className="flex items-center gap-2 text-[#A1A1AA]"><Phone size={16} />{client.phone}</div>}
                <div className="flex items-center gap-2 text-[#D4AF37]"><Calendar size={16} />Inscrit le {new Date(client.created_at).toLocaleDateString('fr-FR')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
};

export default AdminClients;
