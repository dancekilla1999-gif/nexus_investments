-- Where fee accrual last reached, per position.
--
-- Accrual has to be resumable and exactly-once over time: a job that runs twice in a day must
-- charge for one day, and a job that misses a day must still charge for it when it next runs.
-- Deriving the period from "now minus one day" would do neither. Storing the watermark makes
-- the period explicit and the arithmetic auditable — an investor can see the exact window each
-- charge covers.
--
-- Nullable: a position that has never accrued starts from its own creation time.

ALTER TABLE "investment_positions" ADD COLUMN "lastAccruedAt" TIMESTAMP(3);
