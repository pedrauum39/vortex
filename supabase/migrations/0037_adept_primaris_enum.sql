-- Adept Primaris: o primaris do Time 3 (Vortex III). Valor novo de enum não
-- pode ser usado na mesma migração que o cria, então acesso e comissão
-- entram na 0038.

alter type cargo_t add value if not exists 'adept_primaris';
