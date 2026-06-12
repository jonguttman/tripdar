-- Flavor attribution: tester votes (recipe-smell detector) and photo labels
ALTER TABLE "TesterVote" ADD COLUMN "flavor" TEXT;
ALTER TABLE "ProductPhoto" ADD COLUMN "flavor" TEXT;
