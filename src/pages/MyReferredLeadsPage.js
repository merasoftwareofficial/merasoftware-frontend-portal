import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Users2, Loader2 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import Surface from '../components/Surface';
import Badge from '../components/Badge';
import SummaryApi from '../common';
import displayINRCurrency from '../helpers/displayCurrency';

const formatDate = (value) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-IN');
};

// The backend sends only these three: a lead's real category stays with the team.
const REFERRED_TONES = { Matured: 'success', Closed: 'neutral', 'In progress': 'pending' };

const MyReferredLeadsPage = () => {
  const user = useSelector((state) => state?.user?.user);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchReferredLeads = async () => {
    try {
      setLoading(true);
      const response = await fetch(SummaryApi.myReferredLeads.url, {
        method: SummaryApi.myReferredLeads.method,
        credentials: 'include',
      });
      const result = await response.json();
      if (result.success) {
        setLeads(Array.isArray(result.data) ? result.data : []);
      }
    } catch (error) {
      console.error('Error fetching referred leads:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReferredLeads();
  }, []);

  const totalEarned = leads.reduce((sum, lead) => sum + (lead.rewardAmount || 0), 0);

  return (
    <DashboardLayout user={user}>
      <div className="min-h-full px-3 py-4 sm:px-5 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              People Connected
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base text-[var(--text-secondary)]">
              Leads you referred, and the reward you earned for each.
            </p>
          </div>

          <Surface tone="subtle" sheen className="mt-8 p-5 text-center sm:p-6">
            <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">Total earned</p>
            <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{displayINRCurrency(totalEarned)}</p>
          </Surface>

          <Surface tone="subtle" className="mt-6 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[var(--text-secondary)]">
                <Loader2 className="animate-spin" size={28} />
              </div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center">
                <Users2 className="mb-3 text-[var(--text-secondary)]" size={32} />
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">No connections yet</h3>
                <p className="mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
                  When you refer someone and our team adds them as a lead, they'll show up here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--glass-border)]">
                {leads.map((lead) => (
                  <div key={lead._id} className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-[var(--text-primary)]">{lead.name}</p>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{formatDate(lead.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge tone={REFERRED_TONES[lead.status] || 'pending'} size="sm">
                        {lead.status}
                      </Badge>
                      <p className="text-base font-bold text-[var(--text-primary)]">{displayINRCurrency(lead.rewardAmount || 0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Surface>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MyReferredLeadsPage;
