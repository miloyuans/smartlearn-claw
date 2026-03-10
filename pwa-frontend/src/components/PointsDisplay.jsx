"use client";

export default function PointsDisplay({ points, onAward, onRedeem }) {
  return (
    <div className="card p-5">
      <h3 className="panel-title">Points Center</h3>
      <p className="mt-2 text-4xl font-black tracking-tight text-emerald-700">{points}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onAward("complete_exam")} className="btn-outline">
          Complete Exam +20
        </button>
        <button type="button" onClick={() => onAward("finish_review")} className="btn-outline">
          Finish Review +15
        </button>
        <button type="button" onClick={() => onRedeem(50)} className="btn-primary">
          Redeem Gift -50
        </button>
      </div>
    </div>
  );
}
