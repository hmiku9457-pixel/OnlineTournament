-- Scoring parity with src/domain/sportScoring.ts, no permanent fixtures.
do $$
declare s jsonb; r record;
begin
  for r in select * from (values
    ('table_tennis',3,'[{"sideAScore":11,"sideBScore":7},{"sideAScore":12,"sideBScore":10}]',true,false,null::text,true),
    ('table_tennis',3,'[{"sideAScore":11,"sideBScore":7}]',true,false,null,false),
    ('table_tennis',3,'[{"sideAScore":11,"sideBScore":7}]',false,false,null,true),
    ('table_tennis',3,'[{"sideAScore":11,"sideBScore":7},{"sideAScore":11,"sideBScore":9},{"sideAScore":7,"sideBScore":11}]',true,false,null,false),
    ('table_tennis',1,'[{"sideAScore":9,"sideBScore":7}]',true,false,null,false),
    ('tennis',1,'[{"sideAScore":7,"sideBScore":6}]',true,false,null,true),
    ('badminton',1,'[{"sideAScore":30,"sideBScore":29}]',true,false,null,true),
    ('volleyball',3,'[{"sideAScore":25,"sideBScore":19},{"sideAScore":19,"sideBScore":25},{"sideAScore":15,"sideBScore":13}]',true,false,null,true),
    ('football',1,'[{"sideAScore":1,"sideBScore":1}]',true,false,null,true),
    ('football',1,'[{"sideAScore":1,"sideBScore":1}]',true,true,null,false),
    ('football',1,'[{"sideAScore":1,"sideBScore":1}]',true,true,'B',true),
    ('basketball',1,'[{"sideAScore":50,"sideBScore":50}]',true,false,null,false)
  ) v(sport,bo,sets,finished,requires_winner,decision_side,expected) loop
    s:=r.sets::jsonb;
    if tournament_private.valid_online_score(r.sport,r.bo,s,r.finished,r.requires_winner,r.decision_side) is distinct from r.expected then
      raise exception 'score parity failed: %',r;
    end if;
  end loop;
end $$;
select '12 scoring cases passed' as result;
