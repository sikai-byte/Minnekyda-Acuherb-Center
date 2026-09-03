/// The clinic's own estimate of the paper process, used to state what the platform gives back.
/// These are estimates, not measurements, and every report that uses them has to say so —
/// the honest claim is "at the clinic's stated 60 minutes a chart, this saved N hours", never
/// "this saved N hours".
export const PAPER_INTAKE_PREP_MINUTES = 10;

/// Re-typing the completed paper form into the old software. The clinic's stated figure, and
/// their note was that it often runs longer.
export const PAPER_INTAKE_TRANSCRIPTION_MINUTES = 50;

export const PAPER_CHART_MINUTES = PAPER_INTAKE_PREP_MINUTES + PAPER_INTAKE_TRANSCRIPTION_MINUTES;

/// Check-in, booking the next visit and taking payment at the desk, per visit. What a patient
/// doing those things themselves gives back to the front desk.
export const FRONT_DESK_MINUTES_PER_VISIT = 15;
