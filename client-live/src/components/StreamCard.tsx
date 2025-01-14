import Link from 'next/link';

interface Stream {
  id: string;
  name: string;
  status: 'Idle' | 'Live' | 'Ended';
  hls_url?: string;
}

interface StreamCardProps {
  stream: Stream;
}

export function StreamCard({ stream }: StreamCardProps) {
  return (
    <Link href={`/live/${stream.id}`}>
      <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
        <h2 className="text-xl font-bold mb-2">{stream.name}</h2>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${
            stream.status === 'Live' ? 'bg-green-500' : 'bg-gray-500'
          }`} />
          <span>{stream.status}</span>
        </div>
      </div>
    </Link>
  );
}