-- Store dashboard session status as a summary field instead of deriving it in the frontend.
ALTER TABLE interview_sessions
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'pending';

CREATE OR REPLACE FUNCTION pg_temp.hci_jsonb_array_length_compat(value jsonb)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    parsed jsonb;
BEGIN
    IF value IS NULL THEN
        RETURN 0;
    END IF;

    IF jsonb_typeof(value) = 'array' THEN
        RETURN jsonb_array_length(value);
    END IF;

    IF jsonb_typeof(value) = 'string' THEN
        parsed := (value #>> '{}')::jsonb;
        IF jsonb_typeof(parsed) = 'array' THEN
            RETURN jsonb_array_length(parsed);
        END IF;
    END IF;

    RETURN 0;
EXCEPTION WHEN others THEN
    RETURN 0;
END;
$$;

UPDATE interview_sessions
SET status = CASE
    WHEN total_questions > 0 AND current_index >= total_questions THEN 'completed'
    WHEN current_index > 0 OR pg_temp.hci_jsonb_array_length_compat(answers) > 0 THEN 'active'
    ELSE 'pending'
END;
