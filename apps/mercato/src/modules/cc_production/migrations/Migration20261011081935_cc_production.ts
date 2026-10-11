import { Migration } from '@mikro-orm/migrations';

export class Migration20261011081935_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_upload_batches" add "records" jsonb null, add "status" text not null default 'done', add "undone_at" timestamptz null, add "undone_by_name" text null, add "undo_reason" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_upload_batches" drop column "records", drop column "status", drop column "undone_at", drop column "undone_by_name", drop column "undo_reason";`);
  }

}
