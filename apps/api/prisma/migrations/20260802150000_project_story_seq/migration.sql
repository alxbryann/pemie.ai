-- Contador monótono de keys de HU por proyecto (PEM-20).
--
-- `nextStoryKey` derivaba la key del máximo de las HUs **vivas**, así que borrar
-- la HU más alta devolvía esa key al pool y la siguiente creación la reutilizaba.
-- Una key reciclada no es cosmética: `opGetStoryCommitProgress` busca commits
-- cuyo mensaje contenga el texto de la key, de modo que los commits de la HU
-- borrada pasaban a contarse como avance de la HU nueva que heredó su key.
ALTER TABLE "projects" ADD COLUMN "storySeq" INTEGER NOT NULL DEFAULT 0;

-- Arranca por encima de la key más alta que cada proyecto llegó a emitir y que
-- todavía se puede observar. Las HUs ya borradas no dejaron rastro, así que este
-- backfill no puede recuperarlas: se toma también el prefijo de los títulos de
-- tarjeta («PEM-19 · …», el formato que fija opCreateStory), que sobreviven al
-- borrado de la HU y son la única evidencia que queda de una key ya emitida.
WITH used AS (
  SELECT s."projectId" AS project_id,
         (regexp_match(s."key", '-(\d+)$'))[1]::INTEGER AS n
  FROM "user_stories" s
  WHERE s."key" ~ '-\d+$'
  UNION ALL
  SELECT p."id" AS project_id,
         (regexp_match(c."title", '-(\d+) '))[1]::INTEGER AS n
  FROM "cards" c
  JOIN "boards" b ON b."id" = c."boardId"
  JOIN "projects" p ON p."id" = b."projectId"
  -- Solo títulos con el prefijo de ESTE proyecto: otro prefijo no dice nada
  -- sobre su contador.
  WHERE c."title" ~ ('^' || p."key" || '-\d+ ')
)
UPDATE "projects" p
SET "storySeq" = sub.max_n
FROM (SELECT project_id, MAX(n) AS max_n FROM used GROUP BY project_id) sub
WHERE p."id" = sub.project_id
  AND sub.max_n > p."storySeq";
