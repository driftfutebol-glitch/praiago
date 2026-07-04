-- O helper e chamado por policies tambem avaliadas como anon.
-- O schema private nao fica exposto no Data API, mas o role precisa executar a funcao durante RLS.
grant usage on schema private to anon;
grant execute on function private.is_admin() to anon;

notify pgrst, 'reload schema';
