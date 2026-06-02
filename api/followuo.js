-- Identifica leads que não responderam em 24h e agenda follow-up
CREATE OR REPLACE FUNCTION agendar_followups()
RETURNS void AS $$
BEGIN
  -- Follow-up 1: não respondeu em 24h
  INSERT INTO sdr_followup (phone, tentativa)
  SELECT DISTINCT cc.telefone, 1
  FROM campanha_contatos cc
  LEFT JOIN sdr_conversas sc ON sc.phone = '55' || regexp_replace(cc.telefone, '[^0-9]', '', 'g')
  LEFT JOIN sdr_followup sf ON sf.phone = cc.telefone AND sf.tentativa = 1
  WHERE cc.status = 'enviada'
    AND cc.enviado_em < NOW() - INTERVAL '24 hours'
    AND sc.phone IS NULL  -- nunca respondeu
    AND sf.id IS NULL;    -- ainda não tem follow-up agendado

  -- Follow-up 2: não respondeu em 48h
  INSERT INTO sdr_followup (phone, tentativa)
  SELECT DISTINCT sf1.phone, 2
  FROM sdr_followup sf1
  LEFT JOIN sdr_followup sf2 ON sf2.phone = sf1.phone AND sf2.tentativa = 2
  WHERE sf1.tentativa = 1
    AND sf1.enviado = true
    AND sf1.enviado_em < NOW() - INTERVAL '24 hours'
    AND sf2.id IS NULL;
END;
$$ LANGUAGE plpgsql;
