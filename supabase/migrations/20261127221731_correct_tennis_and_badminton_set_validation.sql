CREATE OR REPLACE FUNCTION tournament_private.valid_online_score(p_sport text, p_best_of integer, p_sets jsonb, p_finished boolean, p_requires_winner boolean, p_decision_side text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_set jsonb; a numeric; b numeric; w numeric; l numeric; target integer;
  n integer:=0; wa integer:=0; wb integer:=0; needed integer;
begin
  if p_sport in ('football','futsal','handball','hockey','ice_hockey','basketball') then
    if jsonb_array_length(p_sets)>1 or (p_finished and jsonb_array_length(p_sets)<>1) then return false; end if;
    if p_finished then
      a:=(p_sets->0->>'sideAScore')::numeric; b:=(p_sets->0->>'sideBScore')::numeric;
      if a=b and (p_sport='basketball' or (p_requires_winner and coalesce(p_decision_side,'') not in ('A','B'))) then return false; end if;
    end if;
    return true;
  end if;
  if p_sport not in ('table_tennis','volleyball','beach_volleyball','tennis','badminton','padel','squash')
     or p_best_of is null or p_best_of<1 or jsonb_array_length(p_sets)>p_best_of then return false; end if;
  needed:=(p_best_of+1)/2;
  for v_set in select value from jsonb_array_elements(p_sets) loop
    if greatest(wa,wb)>=needed then return false; end if;
    n:=n+1; a:=(v_set->>'sideAScore')::numeric; b:=(v_set->>'sideBScore')::numeric;
    w:=greatest(a,b); l:=least(a,b);
    if a=b then return false; end if;
    target:=case when p_sport='badminton' then 21
      when p_sport in ('tennis','padel') then 6
      when p_sport='volleyball' then case when p_best_of>1 and n=p_best_of then 15 else 25 end
      when p_sport='beach_volleyball' then case when p_best_of>=3 and n=3 then 15 else 21 end
      else 11 end;
    if p_sport in ('tennis','padel') then
      if not ((w=6 and l<=4) or (w=7 and l in (5,6))) then return false; end if;
    elsif p_sport='badminton' then
      if not ((w=30 and l=29) or (w=21 and l<=19) or (w>21 and w-l=2 and w<=30)) then return false; end if;
    elsif not ((w>=target and w-l=2) or (w=target and l<target-1)) then return false;
    end if;
    if a>b then wa:=wa+1; else wb:=wb+1; end if;
  end loop;
  return not p_finished or greatest(wa,wb)=needed;
end $function$
;