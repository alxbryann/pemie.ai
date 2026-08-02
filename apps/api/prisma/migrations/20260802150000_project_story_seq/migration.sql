-- Contador monótono de keys de HU por proyecto (PEM-20).
--
-- `nextStoryKey` derivaba la key del máximo de las HUs **vivas**, así que borrar
-- la HU más alta devolvía esa key al pool y la siguiente creación la reutilizaba.
-- Una key reciclada no es cosmética: `opGetStoryCommitProgress` busca commits
-- cuyo mensaje contenga el texto de la key, de modo que los commits de la HU
-- borrada pasaban a contarse como avance de la HU nueva que heredó su key.
ALTER TABLE "projects" ADD COLUMN "storySeq" INTEGER NOT NULL DEFAULT 0;

-- Arranca por encima de la key más alta que cada proyecto llegó a emitir y que
-- todavía se puede observar. Arrancar por debajo reabriría el reciclaje que esta
-- migración viene a cerrar, así que se cruzan las tres fuentes que sobreviven al
-- borrado de una HU:
--
--   1. las keys de las HUs vivas;
--   2. el prefijo de los títulos de tarjeta («PEM-19 · …», el formato que fija
--      opCreateStory) — editable con update_card, así que no alcanza solo;
--   3. los mensajes de commit, que es donde opGetStoryCommitProgress busca las
--      keys y que nadie reescribe: la evidencia más durable de las tres.
--
-- Una HU borrada sin tarjeta y sin commits no dejó rastro en ninguna: ese caso
-- es irrecuperable y el contador arrancará por debajo de ella.
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
  UNION ALL
  -- `regexp_matches` con 'g' porque un mismo commit puede referenciar varias
  -- keys; con `regexp_match` se perdería todo menos la primera.
  SELECT cm."projectId" AS project_id, m[1]::INTEGER AS n
  FROM "commits" cm
  JOIN "projects" p2 ON p2."id" = cm."projectId"
  CROSS JOIN LATERAL regexp_matches(cm."message", p2."key" || '-(\d+)', 'g') AS m
)
UPDATE "projects" p
SET "storySeq" = sub.max_n
FROM (SELECT project_id, MAX(n) AS max_n FROM used GROUP BY project_id) sub
WHERE p."id" = sub.project_id
  AND sub.max_n > p."storySeq";
