-- Backfill older sessions whose questions JSONB value is a string containing a JSON array.
CREATE OR REPLACE FUNCTION pg_temp.hci_jsonb_array_length_from_text(value text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    parsed jsonb;
BEGIN
    IF value IS NULL THEN
        RETURN 0;
    END IF;

    parsed := value::jsonb;
    IF jsonb_typeof(parsed) = 'array' THEN
        RETURN jsonb_array_length(parsed);
    END IF;
    RETURN 0;
EXCEPTION WHEN others THEN
    RETURN 0;
END;
$$;

UPDATE interview_sessions
SET total_questions = CASE
    WHEN jsonb_typeof(questions) = 'array' THEN jsonb_array_length(questions)
    WHEN jsonb_typeof(questions) = 'string' THEN pg_temp.hci_jsonb_array_length_from_text(questions #>> '{}')
    ELSE 0
END
WHERE questions IS NOT NULL;
