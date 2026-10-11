import { Migration } from '@mikro-orm/migrations';

export class Migration20261010171958_cc_purchase extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_pos" add "revision" int not null default 1, add "revisions" jsonb null, add "short_closed_at" timestamptz null, add "short_close_reason" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_pos" drop column "revision", drop column "revisions", drop column "short_closed_at", drop column "short_close_reason";`);
  }

}
