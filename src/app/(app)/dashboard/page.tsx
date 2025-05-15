import type { Metadata } from 'next';
import ShipmentOverview from '@/components/dashboard/ShipmentOverview';

export const metadata: Metadata = {
  title: 'Dashboard - TrackPulse',
};

export default function DashboardPage() {
  return (
    <div className="container mx-auto py-8 px-4 md:px-6 lg:px-8">
      <ShipmentOverview />
    </div>
  );
}
