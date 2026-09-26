import { Migration } from '@mikro-orm/migrations';

export class Migration20260926112434_dermat_quality extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "dermat_quality_checks" add "ar_no" text null, add "round" int not null default 1, add "worksheet" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "dermat_quality_checks" drop column "ar_no", drop column "round", drop column "worksheet";`);
  }

}
