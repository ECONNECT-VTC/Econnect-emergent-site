import { useEffect, useState } from 'react';
import axios from 'axios';
import API_URL from '@/config';

const roleLabel = (role) => role === 'admin' ? '🔑 Admin' : role === 'driver' ? '🚗 Chauffeur' : '👤 Client';
const roleColor = (role) => role === 'admin' ? 'text-[#D4AF37]' : role === 'driver' ? 'text-blue-400' : 'text-green-400';

const BookingComments = ({ bookingId }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchComments = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/bookings/${bookingId}/comments`, { withCredentials: true });
      setComments(res.data);
    } catch (e) {}
  };

  useEffect(() => { fetchComments(); }, [bookingId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_URL}/api/bookings/${bookingId}/comments`, { comment: newComment }, { withCredentials: true });
      setNewComment('');
      fetchComments();
    } catch (err) {
      setError("Impossible d'envoyer le commentaire");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <h4 className="text-sm font-semibold text-[#A1A1AA] mb-3">💬 Commentaires</h4>
      {comments.length === 0 ? <p className="text-xs text-[#A1A1AA] mb-3">Aucun commentaire</p> : (
        <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
          {comments.map((c) => (
            <div key={c.id} className="bg-[#1E1E1E] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium ${roleColor(c.author_role)}`}>{roleLabel(c.author_role)}</span>
                <span className="text-xs text-[#A1A1AA]">{c.author_name}</span>
                <span className="text-xs text-[#525252] ml-auto">{new Date(c.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <p className="text-sm text-white">{c.comment}</p>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Ajouter un commentaire..." className="flex-1 bg-[#141414] border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-[#A1A1AA]" />
        <button type="submit" disabled={loading} className="px-4 py-2 rounded bg-[#D4AF37] text-[#0A0A0A] text-sm font-medium hover:bg-[#F0C74A] disabled:opacity-50">Envoyer</button>
      </form>
    </div>
  );
};

export default BookingComments;
