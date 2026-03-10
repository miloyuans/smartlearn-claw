"use client";

export default function PointsDisplay({ points, onAward, onRedeem }) {
  return (
    <div className="card p-4">
      <h3 className="text-lg font-semibold text-brand-900">Points Center</h3>
      <p className="mt-2 text-2xl font-bold text-brand-700">{points}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onAward("complete_exam")}
          className="rounded-md border border-brand-700 px-3 py-2 text-brand-700"
        >
          Complete Exam +20
        </button>
        <button
          type="button"
          onClick={() => onAward("finish_review")}
          className="rounded-md border border-brand-700 px-3 py-2 text-brand-700"
        >
          Finish Review +15
        </button>
        <button
          type="button"
          onClick={() => onRedeem(50)}
          className="rounded-md bg-brand-500 px-3 py-2 text-white"
        >
          Redeem Gift (-50)
        </button>
      </div>
    </div>
  );
}
