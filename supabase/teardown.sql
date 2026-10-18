-- Removes EVERYTHING the team tracker created (all teams, all history).
-- Export anything you want to keep from Admin first. Other apps in this project are untouched.
drop table if exists public.tpt_lessons, public.tpt_activity, public.tpt_tasks, public.tpt_events,
  public.tpt_members, private.tpt_devices, private.tpt_join_codes, public.tpt_teams,
  private.tpt_admins, private.tpt_config cascade;
drop function if exists public.tpt_is_admin(), public.tpt_can_read(uuid), public.tpt_can_write(uuid),
  public.tpt_claim_admin(text), public.tpt_join_team(text), public.tpt_leave_team(uuid),
  public.tpt_join_code(uuid), public.tpt_set_join_code(uuid, text),
  private.tpt_set_admin_passcode(text), private.tpt_touch_updated_at();
