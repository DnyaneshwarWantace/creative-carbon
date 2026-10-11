import { Migration } from '@mikro-orm/migrations';

export class Migration20261011083039_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_sync_clashes" add "record_type" text null, add "record_id" text null, add "path" text null, add "offline_version" jsonb null, add "server_version" jsonb null, add "server_by_name" text null, add "queued_at" timestamptz null, add "status" text not null default 'open', add "kept" text null, add "resolved_at" timestamptz null, add "resolved_by_name" text null, add "resolve_reason" text null, add "updated_at" timestamptz not null default now();`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_sync_clashes" drop column "record_type", drop column "record_id", drop column "path", drop column "offline_version", drop column "server_version", drop column "server_by_name", drop column "queued_at", drop column "status", drop column "kept", drop column "resolved_at", drop column "resolved_by_name", drop column "resolve_reason", drop column "updated_at";`);
  }

}
