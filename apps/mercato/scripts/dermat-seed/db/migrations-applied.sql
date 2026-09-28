--
-- PostgreSQL database dump
--

\restrict xDABYrLy8lNCsBlZCbbZmlAgJBsxB27FYDxkM4WccblpYLFKqDkigzLdUcrf1Wb

-- Dumped from database version 17.11 (Debian 17.11-1.pgdg13+2)
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: mikro_orm_migrations_ai_assistant; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_ai_assistant (id, name, executed_at) FROM stdin;
1	Migration20260419100521	2026-09-13 05:12:29.81054+00
2	Migration20260419132948	2026-09-13 05:12:29.991882+00
3	Migration20260419134235	2026-09-13 05:12:30.02109+00
4	Migration20260508140000	2026-09-13 05:12:30.064224+00
5	Migration20260508160000_ai_agent_loop_overrides	2026-09-13 05:12:30.10224+00
6	Migration20260508170000_ai_token_usage	2026-09-13 05:12:30.16425+00
7	Migration20260512090000	2026-09-13 05:12:30.190659+00
8	Migration20260512130000	2026-09-13 05:12:30.20671+00
9	Migration20260518092853_ai_assistant	2026-09-13 05:12:30.217387+00
10	Migration20260522120000_ai_assistant	2026-09-13 05:12:30.24685+00
11	Migration20260610134045_ai_assistant	2026-09-13 05:12:30.261002+00
12	Migration20260913112945_ai_assistant	2026-09-13 11:49:36.664385+00
\.


--
-- Data for Name: mikro_orm_migrations_api_keys; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_api_keys (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:12:30.322565+00
2	Migration20260116225251	2026-09-13 05:12:30.333366+00
3	Migration20260125204102	2026-09-13 05:12:30.342587+00
4	Migration20260523234901	2026-09-13 05:12:30.351168+00
5	Migration20260913112946_api_keys	2026-09-13 11:49:36.878658+00
\.


--
-- Data for Name: mikro_orm_migrations_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_attachments (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:12:30.403817+00
2	Migration20251117181353	2026-09-13 05:12:30.419858+00
3	Migration20260201000000	2026-09-13 05:12:30.450232+00
4	Migration20260201000001	2026-09-13 05:12:30.477742+00
5	Migration20260524000000	2026-09-13 05:12:30.496207+00
6	Migration20260709234741_attachments	2026-09-13 05:12:30.516973+00
7	Migration20260913112946_attachments	2026-09-13 11:49:36.997709+00
\.


--
-- Data for Name: mikro_orm_migrations_audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_audit_logs (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:12:30.63712+00
2	Migration20260207101938	2026-09-13 05:12:30.661692+00
3	Migration20260412160533	2026-09-13 05:12:30.678014+00
4	Migration20260423202109	2026-09-13 05:12:30.698+00
5	Migration20260611104500	2026-09-13 05:12:30.725704+00
6	Migration20260913112947_audit_logs	2026-09-13 11:49:37.131201+00
\.


--
-- Data for Name: mikro_orm_migrations_auth; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_auth (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:12:30.801979+00
2	Migration20251031083009	2026-09-13 05:12:31.019367+00
3	Migration20251209080326	2026-09-13 05:12:31.035274+00
4	Migration20260324100000	2026-09-13 05:12:31.047234+00
5	Migration20260411203200	2026-09-13 05:12:31.05894+00
6	Migration20260427081815	2026-09-13 05:12:31.07424+00
7	Migration20260427124900	2026-09-13 05:12:31.085944+00
8	Migration20260427143311	2026-09-13 05:12:31.096419+00
9	Migration20260601120000	2026-09-13 05:12:31.116078+00
10	Migration20260610120000	2026-09-13 05:12:31.130988+00
11	Migration20260611103000	2026-09-13 05:12:31.148293+00
12	Migration20260728134212_auth	2026-09-13 05:12:31.161596+00
13	Migration20260913112948_auth	2026-09-13 11:49:37.274311+00
\.


--
-- Data for Name: mikro_orm_migrations_business_rules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_business_rules (id, name, executed_at) FROM stdin;
1	Migration20251102070555	2026-09-13 05:12:31.21137+00
2	Migration20251102111834	2026-09-13 05:12:31.227713+00
3	Migration20251102200432	2026-09-13 05:12:31.262624+00
4	Migration20251219052928	2026-09-13 05:12:31.433844+00
5	Migration20260419135145	2026-09-13 05:12:31.481495+00
6	Migration20260913112948_business_rules	2026-09-13 11:49:37.433124+00
\.


--
-- Data for Name: mikro_orm_migrations_catalog; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_catalog (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:12:31.639853+00
2	Migration20251114080223	2026-09-13 05:12:31.723566+00
3	Migration20251114085155	2026-09-13 05:12:31.771806+00
4	Migration20251114145201	2026-09-13 05:12:31.803931+00
5	Migration20251114184759	2026-09-13 05:12:31.844692+00
6	Migration20251115204549	2026-09-13 05:12:31.895551+00
7	Migration20251116183727	2026-09-13 05:12:31.941891+00
8	Migration20251116191744	2026-09-13 05:12:31.975097+00
9	Migration20251117134301	2026-09-13 05:12:32.022994+00
10	Migration20251117162316	2026-09-13 05:12:32.062286+00
11	Migration20251117165931	2026-09-13 05:12:32.086307+00
12	Migration20251117173713	2026-09-13 05:12:32.153224+00
13	Migration20251118094851	2026-09-13 05:12:32.236141+00
14	Migration20251118110216	2026-09-13 05:12:32.274807+00
15	Migration20251119072339	2026-09-13 05:12:32.324628+00
16	Migration20251119154651	2026-09-13 05:12:32.362159+00
17	Migration20251123105433	2026-09-13 05:12:32.376048+00
18	Migration20251123174703	2026-09-13 05:12:32.399641+00
19	Migration20251201164458	2026-09-13 05:12:32.417516+00
20	Migration20251201165844	2026-09-13 05:12:32.428836+00
21	Migration20260204120000	2026-09-13 05:12:32.441911+00
22	Migration20260215101500	2026-09-13 05:12:32.464625+00
23	Migration20260218225422	2026-09-13 05:12:32.478237+00
24	Migration20260219084500	2026-09-13 05:12:32.505538+00
25	Migration20260220164228	2026-09-13 05:12:32.535005+00
26	Migration20260611090000	2026-09-13 05:12:32.578322+00
27	Migration20260913112950_catalog	2026-09-13 11:49:37.620799+00
\.


--
-- Data for Name: mikro_orm_migrations_checkout; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_checkout (id, name, executed_at) FROM stdin;
1	Migration20260319151615	2026-09-13 05:12:32.842322+00
2	Migration20260319190203	2026-09-13 05:12:32.937021+00
3	Migration20260319190701	2026-09-13 05:12:32.963164+00
4	Migration20260319212129	2026-09-13 05:12:32.985202+00
5	Migration20260913112951_checkout	2026-09-13 11:49:37.786904+00
\.


--
-- Data for Name: mikro_orm_migrations_communication_channels; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_communication_channels (id, name, executed_at) FROM stdin;
1	Migration20260526134719_communication_channels	2026-09-13 05:12:33.093123+00
2	Migration20260527195446_communication_channels	2026-09-13 05:12:33.243087+00
3	Migration20260529231848_communication_channels	2026-09-13 05:12:33.266297+00
4	Migration20260531120000_communication_channels	2026-09-13 05:12:33.281377+00
5	Migration20260703123630_communication_channels	2026-09-13 05:12:33.298861+00
6	Migration20260913112951_communication_channels	2026-09-13 11:49:37.915034+00
\.


--
-- Data for Name: mikro_orm_migrations_configs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_configs (id, name, executed_at) FROM stdin;
1	Migration20251115103000	2026-09-13 05:12:33.406934+00
2	Migration20251123174547	2026-09-13 05:12:33.433112+00
3	Migration20260617150000	2026-09-13 05:12:33.463784+00
4	Migration20260913112952_configs	2026-09-13 11:49:38.012585+00
\.


--
-- Data for Name: mikro_orm_migrations_currencies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_currencies (id, name, executed_at) FROM stdin;
1	Migration20251230120933	2026-09-13 05:12:33.610178+00
2	Migration20251230151605	2026-09-13 05:12:33.636672+00
3	Migration20251231132646	2026-09-13 05:12:33.663411+00
4	Migration20260105105740	2026-09-13 05:12:33.681919+00
5	Migration20260105114201	2026-09-13 05:12:33.699916+00
6	Migration20260113081652	2026-09-13 05:12:33.71967+00
7	Migration20260115201340	2026-09-13 05:12:33.743262+00
8	Migration20260913112953_currencies	2026-09-13 11:49:38.108205+00
\.


--
-- Data for Name: mikro_orm_migrations_customer_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_customer_accounts (id, name, executed_at) FROM stdin;
1	Migration20260313222043	2026-09-13 05:12:33.821657+00
2	Migration20260411113503	2026-09-13 05:12:33.952678+00
3	Migration20260430120000_customer_accounts	2026-09-13 05:12:33.976367+00
4	Migration20260723120000_customer_accounts	2026-09-13 05:12:34.012369+00
5	Migration20260724120000_customer_accounts	2026-09-13 05:12:34.028643+00
6	Migration20260913112954_customer_accounts	2026-09-13 11:49:38.212704+00
\.


--
-- Data for Name: mikro_orm_migrations_customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_customers (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:12:34.144338+00
2	Migration20251124135129	2026-09-13 05:12:34.24696+00
3	Migration20260218191730	2026-09-13 05:12:34.266287+00
4	Migration20260319131625	2026-09-13 05:12:34.313819+00
5	Migration20260401172819	2026-09-13 05:12:34.366793+00
6	Migration20260406214502	2026-09-13 05:12:34.407334+00
7	Migration20260408135736	2026-09-13 05:12:34.44758+00
8	Migration20260408225345	2026-09-13 05:12:34.49064+00
9	Migration20260411075533	2026-09-13 05:12:34.545876+00
10	Migration20260411103551	2026-09-13 05:12:34.614533+00
11	Migration20260411130944	2026-09-13 05:12:34.634392+00
12	Migration20260415095203	2026-09-13 05:12:34.677047+00
13	Migration20260415135056	2026-09-13 05:12:34.700541+00
14	Migration20260417140000	2026-09-13 05:12:34.734699+00
15	Migration20260417160000	2026-09-13 05:12:34.754678+00
16	Migration20260417235407	2026-09-13 05:12:34.768703+00
17	Migration20260513203311_customers	2026-09-13 05:12:34.778374+00
18	Migration20260519120000_pipeline_stage_color_tones	2026-09-13 05:12:34.789593+00
19	Migration20260521175027	2026-09-13 05:12:34.801152+00
20	Migration20260527012240_customers	2026-09-13 05:12:34.810047+00
21	Migration20260602202147_customers	2026-09-13 05:12:34.824061+00
22	Migration20260723210000_customers	2026-09-13 05:12:34.833484+00
23	Migration20260913112956_customers	2026-09-13 11:49:38.366239+00
24	Migration20260925062741_customers	2026-09-23 08:09:18.574924+00
\.


--
-- Data for Name: mikro_orm_migrations_dashboards; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dashboards (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:12:34.879141+00
2	Migration20260913112957_dashboards	2026-09-13 11:49:38.553306+00
\.


--
-- Data for Name: mikro_orm_migrations_data_sync; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_data_sync (id, name, executed_at) FROM stdin;
1	Migration20260304113737	2026-09-13 05:12:34.942599+00
2	Migration20260810120000	2026-09-13 05:12:34.966094+00
3	Migration20260913112958_data_sync	2026-09-13 11:49:38.658426+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_accounts (id, name, executed_at) FROM stdin;
1	Migration20260926063640_dermat_accounts	2026-09-26 06:36:57.488975+00
2	Migration20260926120419_dermat_accounts	2026-09-26 12:04:49.737767+00
3	Migration20260926121732_dermat_accounts	2026-09-26 12:17:51.117905+00
4	Migration20260926134840_dermat_accounts	2026-09-26 13:48:51.488037+00
5	Migration20260926191721_dermat_accounts	2026-09-26 19:17:39.742992+00
6	Migration20260927034939_dermat_accounts	2026-09-27 03:49:59.784252+00
7	Migration20260927045904_dermat_accounts	2026-09-27 04:59:22.923416+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_bom; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_bom (id, name, executed_at) FROM stdin;
1	Migration20260913173914_dermat_bom	2026-09-13 17:39:24.514724+00
2	Migration20260914084145_dermat_bom	2026-09-14 08:42:48.167611+00
3	Migration20260914093121_dermat_bom	2026-09-14 09:31:46.420376+00
4	Migration20260915075111_dermat_bom	2026-09-15 07:51:57.622479+00
5	Migration20260917075504_dermat_bom	2026-09-17 08:15:46.433717+00
6	Migration20260919121426_dermat_bom	2026-09-19 12:18:07.015558+00
7	Migration20260919193000_dermat_bom	2026-09-19 14:11:38.225072+00
8	Migration20260920150830_dermat_bom	2026-09-22 08:03:43.495064+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_boms; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_boms (id, name, executed_at) FROM stdin;
1	Migration20260925161216_dermat_boms	2026-09-25 16:12:39.742549+00
2	Migration20260925171116_dermat_boms	2026-09-25 17:11:31.218905+00
3	Migration20260926072935_dermat_boms	2026-09-26 07:29:58.406076+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_customers (id, name, executed_at) FROM stdin;
1	Migration20260913171125_dermat_customers	2026-09-13 17:13:24.994817+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_departments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_departments (id, name, executed_at) FROM stdin;
1	Migration20260913112959_dermat_departments	2026-09-13 11:49:38.759628+00
2	Migration20260923074928_dermat_departments	2026-09-22 08:03:43.556046+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_lists; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_lists (id, name, executed_at) FROM stdin;
1	Migration20260926163911_dermat_lists	2026-09-26 16:39:29.051108+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_orders (id, name, executed_at) FROM stdin;
1	Migration20260925175753_dermat_orders	2026-09-25 17:58:07.438352+00
2	Migration20260926063641_dermat_orders	2026-09-26 06:36:57.737581+00
3	Migration20260926180727_dermat_orders	2026-09-26 18:07:59.467042+00
4	Migration20260927052431_dermat_orders	2026-09-27 05:24:47.135805+00
5	Migration20260927135623_dermat_orders	2026-09-27 13:57:30.176376+00
6	Migration20260927143641_dermat_orders	2026-09-27 14:36:51.271978+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_planning; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_planning (id, name, executed_at) FROM stdin;
1	Migration20260925202514_dermat_planning	2026-09-25 20:25:29.648743+00
2	Migration20260927100943_dermat_planning	2026-09-27 10:11:15.87497+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_pm_master; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_pm_master (id, name, executed_at) FROM stdin;
1	Migration20260913171125_dermat_pm_master	2026-09-13 17:13:25.127788+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_production; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_production (id, name, executed_at) FROM stdin;
1	Migration20260913172710_dermat_production	2026-09-13 17:30:44.075435+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_purchase; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_purchase (id, name, executed_at) FROM stdin;
1	Migration20260926060058_dermat_purchase	2026-09-26 06:01:41.366864+00
2	Migration20260926190954_dermat_purchase	2026-09-26 19:10:10.376651+00
3	Migration20260927051037_dermat_purchase	2026-09-27 05:10:58.089255+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_purchase_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_purchase_orders (id, name, executed_at) FROM stdin;
1	Migration20260919144047_dermat_purchase_orders	2026-09-19 14:43:08.204843+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_qc; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_qc (id, name, executed_at) FROM stdin;
1	Migration20260913172711_dermat_qc	2026-09-13 17:30:44.2741+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_quality; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_quality (id, name, executed_at) FROM stdin;
1	Migration20260925191951_dermat_quality	2026-09-25 19:20:03.40067+00
2	Migration20260926112434_dermat_quality	2026-09-26 11:24:57.051063+00
3	Migration20260927035446_dermat_quality	2026-09-27 03:54:57.518731+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_rm_master; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_rm_master (id, name, executed_at) FROM stdin;
1	Migration20260913113459_dermat_rm_master	2026-09-13 11:49:38.794166+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_rnd; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_rnd (id, name, executed_at) FROM stdin;
1	Migration20260926192801_dermat_rnd	2026-09-26 19:28:16.151591+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_sampling; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_sampling (id, name, executed_at) FROM stdin;
1	Migration20260918063711_dermat_sampling	2026-09-18 06:43:22.234723+00
2	Migration20260920065040_dermat_sampling	2026-09-22 08:03:43.647658+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_store; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_store (id, name, executed_at) FROM stdin;
1	Migration20260925195602_dermat_store	2026-09-25 19:56:23.499073+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_vendors; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_vendors (id, name, executed_at) FROM stdin;
1	Migration20260913171126_dermat_vendors	2026-09-13 17:13:25.176622+00
\.


--
-- Data for Name: mikro_orm_migrations_dermat_workflow; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dermat_workflow (id, name, executed_at) FROM stdin;
1	Migration20260925062742_dermat_workflow	2026-09-23 08:09:18.874747+00
2	Migration20260925074918_dermat_workflow	2026-09-25 07:49:30.005352+00
3	Migration20260925081055_dermat_workflow	2026-09-25 08:11:11.721822+00
\.


--
-- Data for Name: mikro_orm_migrations_devices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_devices (id, name, executed_at) FROM stdin;
1	Migration20260602120000	2026-09-13 05:12:35.010484+00
2	Migration20260630120000	2026-09-13 05:12:35.023591+00
3	Migration20260701120000	2026-09-13 05:12:35.036436+00
4	Migration20260721120000	2026-09-13 05:12:35.051434+00
5	Migration20260913113002_devices	2026-09-13 11:49:38.827613+00
\.


--
-- Data for Name: mikro_orm_migrations_dictionaries; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_dictionaries (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:12:35.126134+00
2	Migration20260410171544	2026-09-13 05:12:35.16831+00
3	Migration20260602202147_dictionaries	2026-09-13 05:12:35.191477+00
4	Migration20260913113005_dictionaries	2026-09-13 11:49:38.945936+00
\.


--
-- Data for Name: mikro_orm_migrations_directory; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_directory (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:12:35.247632+00
2	Migration20260314143323	2026-09-13 05:12:35.27993+00
3	Migration20260607222259_directory	2026-09-13 05:12:35.309812+00
4	Migration20260626145500_directory_logo_preserve_aspect_ratio	2026-09-13 05:12:35.330785+00
5	Migration20260913113008_directory	2026-09-13 11:49:39.060424+00
\.


--
-- Data for Name: mikro_orm_migrations_entities; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_entities (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:12:35.410566+00
2	Migration20251116183728	2026-09-13 05:12:35.447616+00
3	Migration20251209080326	2026-09-13 05:12:35.467475+00
4	Migration20260716120000	2026-09-13 05:12:35.484162+00
5	Migration20260722120000	2026-09-13 05:12:35.499108+00
6	Migration20260913113009_entities	2026-09-13 11:49:39.174083+00
\.


--
-- Data for Name: mikro_orm_migrations_eudr; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_eudr (id, name, executed_at) FROM stdin;
1	Migration20260706102002_eudr	2026-09-13 05:12:35.566245+00
2	Migration20260706152612_eudr	2026-09-13 05:12:35.593983+00
3	Migration20260722100000_eudr	2026-09-13 05:12:35.624182+00
4	Migration20260913113009_eudr	2026-09-13 11:49:39.309628+00
\.


--
-- Data for Name: mikro_orm_migrations_example; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_example (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:12:35.695714+00
2	Migration20260226161000_example	2026-09-13 05:12:35.728997+00
3	Migration20260804120546_example	2026-09-13 05:12:35.753639+00
4	Migration20260804163220_example	2026-09-13 05:12:35.773101+00
5	Migration20260913113010_example	2026-09-13 11:49:39.413044+00
\.


--
-- Data for Name: mikro_orm_migrations_example_customers_sync; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_example_customers_sync (id, name, executed_at) FROM stdin;
1	Migration20260401173723	2026-09-13 05:12:35.842209+00
2	Migration20260408162620	2026-09-13 05:12:35.868025+00
3	Migration20260913113010_example_customers_sync	2026-09-13 11:49:39.530666+00
\.


--
-- Data for Name: mikro_orm_migrations_feature_toggles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_feature_toggles (id, name, executed_at) FROM stdin;
1	Migration20251229215803	2026-09-13 05:12:35.921295+00
2	Migration20260104181357	2026-09-13 05:12:35.958271+00
3	Migration20260110132032	2026-09-13 05:12:35.983658+00
4	Migration20260913113011_feature_toggles	2026-09-13 11:49:39.623852+00
\.


--
-- Data for Name: mikro_orm_migrations_inbox_ops; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_inbox_ops (id, name, executed_at) FROM stdin;
1	Migration20260216151619	2026-09-13 05:12:36.075033+00
2	Migration20260221021831	2026-09-13 05:12:36.162181+00
3	Migration20260303173020	2026-09-13 05:12:36.187131+00
4	Migration20260303173215	2026-09-13 05:12:36.203998+00
5	Migration20260607205834	2026-09-13 05:12:36.219479+00
6	Migration20260913113011_inbox_ops	2026-09-13 11:49:39.734515+00
\.


--
-- Data for Name: mikro_orm_migrations_integrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_integrations (id, name, executed_at) FROM stdin;
1	Migration20260304113737	2026-09-13 05:12:36.2863+00
2	Migration20260410120000	2026-09-13 05:12:36.331464+00
3	Migration20260526154136_integrations	2026-09-13 05:12:36.357967+00
4	Migration20260913113012_integrations	2026-09-13 11:49:39.844925+00
\.


--
-- Data for Name: mikro_orm_migrations_manufacturing; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_manufacturing (id, name, executed_at) FROM stdin;
1	Migration20260829000001	2026-09-13 05:12:36.601364+00
2	Migration20260829000002	2026-09-13 05:12:36.732752+00
3	Migration20260829151920_manufacturing	2026-09-13 05:12:36.769948+00
4	Migration20260829200001_production_stage_templates	2026-09-13 05:12:36.788945+00
5	Migration20260913113014_manufacturing	2026-09-13 11:49:39.98977+00
\.


--
-- Data for Name: mikro_orm_migrations_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_messages (id, name, executed_at) FROM stdin;
1	Migration20260213181243	2026-09-13 05:12:36.858804+00
2	Migration20260215165126	2026-09-13 05:12:36.91726+00
3	Migration20260227120000	2026-09-13 05:12:36.939201+00
4	Migration20260417120000	2026-09-13 05:12:36.954539+00
5	Migration20260531130000	2026-09-13 05:12:36.968884+00
6	Migration20260913113016_messages	2026-09-13 11:49:40.27884+00
\.


--
-- Data for Name: mikro_orm_migrations_notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_notifications (id, name, executed_at) FROM stdin;
1	Migration20260123000001	2026-09-13 05:12:37.046924+00
2	Migration20260126150000	2026-09-13 05:12:37.070803+00
3	Migration20260129082610	2026-09-13 05:12:37.08687+00
4	Migration20260625122947_notifications	2026-09-13 05:12:37.100974+00
5	Migration20260626120500_notifications_push_payload	2026-09-13 05:12:37.119372+00
6	Migration20260626130000_notifications_non_opt_out	2026-09-13 05:12:37.13172+00
7	Migration20260626140000_notifications_type_category_silent	2026-09-13 05:12:37.144586+00
8	Migration20260706120000_notifications_channels	2026-09-13 05:12:37.159169+00
9	Migration20260716123121_notifications	2026-09-13 05:12:37.17078+00
10	Migration20260913113019_notifications	2026-09-13 11:49:40.416765+00
\.


--
-- Data for Name: mikro_orm_migrations_onboarding; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_onboarding (id, name, executed_at) FROM stdin;
1	Migration20260112142945	2026-09-13 05:12:37.21152+00
2	Migration20260129082610	2026-09-13 05:12:37.224403+00
3	Migration20260324100000	2026-09-13 05:12:37.233295+00
4	Migration20260401193000	2026-09-13 05:12:37.246483+00
5	Migration20260611120000	2026-09-13 05:12:37.257649+00
6	Migration20260710133207_onboarding	2026-09-13 05:12:37.267375+00
7	Migration20260913113025_onboarding	2026-09-13 11:49:40.569806+00
\.


--
-- Data for Name: mikro_orm_migrations_payment_gateways; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_payment_gateways (id, name, executed_at) FROM stdin;
1	Migration20260305122155	2026-09-13 05:12:37.311964+00
2	Migration20260313222043	2026-09-13 05:12:37.333103+00
3	Migration20260709220735_payment_gateways	2026-09-13 05:12:37.347307+00
4	Migration20260709220938_payment_gateways	2026-09-13 05:12:37.368084+00
5	Migration20260725101500_payment_gateways	2026-09-13 05:12:37.386919+00
6	Migration20260803103035_payment_gateways	2026-09-13 05:12:37.406683+00
7	Migration20260913113027_payment_gateways	2026-09-13 11:49:40.695361+00
\.


--
-- Data for Name: mikro_orm_migrations_perspectives; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_perspectives (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:13:37.807834+00
2	Migration20260619120000_perspectives_live_row_uniqueness	2026-09-13 05:13:38.141967+00
3	Migration20260913113028_perspectives	2026-09-13 11:49:40.828469+00
\.


--
-- Data for Name: mikro_orm_migrations_planner; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_planner (id, name, executed_at) FROM stdin;
1	Migration20260121082329	2026-09-13 05:13:38.231503+00
2	Migration20260121140429	2026-09-13 05:13:38.255242+00
3	Migration20260913113029_planner	2026-09-13 11:49:40.935872+00
\.


--
-- Data for Name: mikro_orm_migrations_progress; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_progress (id, name, executed_at) FROM stdin;
1	Migration20260220214819	2026-09-13 05:13:38.292629+00
2	Migration20260227133000	2026-09-13 05:13:38.308744+00
3	Migration20260913113029_progress	2026-09-13 11:49:41.058921+00
\.


--
-- Data for Name: mikro_orm_migrations_purchasing; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_purchasing (id, name, executed_at) FROM stdin;
1	Migration20260829000001	2026-09-13 05:13:38.370136+00
2	Migration20260829000002	2026-09-13 05:13:38.419735+00
3	Migration20260913113031_purchasing	2026-09-13 11:49:41.197494+00
\.


--
-- Data for Name: mikro_orm_migrations_push_notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_push_notifications (id, name, executed_at) FROM stdin;
1	Migration20260625150049_push_notifications	2026-09-13 05:13:38.482469+00
2	Migration20260626120000_push_notifications_silent	2026-09-13 05:13:38.50393+00
3	Migration20260913113032_push_notifications	2026-09-13 11:49:41.306955+00
\.


--
-- Data for Name: mikro_orm_migrations_query_index; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_query_index (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:13:38.595635+00
2	Migration20251101120000	2026-09-13 05:13:38.65356+00
3	Migration20251212084132	2026-09-13 05:13:38.672326+00
4	Migration20260518162054_query_index	2026-09-13 05:13:38.69055+00
5	Migration20260606205453_query_index	2026-09-13 05:13:38.727715+00
6	Migration20260611103000_query_index	2026-09-13 05:13:38.75174+00
7	Migration20260731105052_query_index	2026-09-13 05:13:38.775835+00
8	Migration20260913113034_query_index	2026-09-13 11:49:41.411061+00
\.


--
-- Data for Name: mikro_orm_migrations_resources; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_resources (id, name, executed_at) FROM stdin;
1	Migration20260121082330	2026-09-13 05:13:38.821811+00
2	Migration20260121142334	2026-09-13 05:13:38.843604+00
3	Migration20260608231000	2026-09-13 05:13:38.860149+00
4	Migration20260913113036_resources	2026-09-13 11:49:41.526559+00
\.


--
-- Data for Name: mikro_orm_migrations_sales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_sales (id, name, executed_at) FROM stdin;
1	Migration20251030150038	2026-09-13 05:13:38.973782+00
2	Migration20251117162317	2026-09-13 05:13:39.118887+00
3	Migration20251124135129	2026-09-13 05:13:39.129397+00
4	Migration20251124155950	2026-09-13 05:13:39.143582+00
5	Migration20251125110706	2026-09-13 05:13:39.158234+00
6	Migration20251125190816	2026-09-13 05:13:39.17597+00
7	Migration20251126080655	2026-09-13 05:13:39.188393+00
8	Migration20251126092015	2026-09-13 05:13:39.21283+00
9	Migration20251126121235	2026-09-13 05:13:39.230652+00
10	Migration20251126121722	2026-09-13 05:13:39.244067+00
11	Migration20251126122735	2026-09-13 05:13:39.254307+00
12	Migration20251126125305	2026-09-13 05:13:39.263859+00
13	Migration20251127172452	2026-09-13 05:13:39.273698+00
14	Migration20251128125246	2026-09-13 05:13:39.283621+00
15	Migration20251201183633	2026-09-13 05:13:39.293778+00
16	Migration20251202075548	2026-09-13 05:13:39.302676+00
17	Migration20260114113050	2026-09-13 05:13:39.310581+00
18	Migration20260116115312	2026-09-13 05:13:39.322662+00
19	Migration20260116115359	2026-09-13 05:13:39.332916+00
20	Migration20260218225423	2026-09-13 05:13:39.342277+00
21	Migration20260219084501	2026-09-13 05:13:39.366091+00
22	Migration20260309073310	2026-09-13 05:13:39.396215+00
23	Migration20260410190007	2026-09-13 05:13:39.445658+00
24	Migration20260624120000_backfill_line_net_from_gross	2026-09-13 05:13:39.485412+00
25	Migration20260806120000_sales_tag_assignment_document_idx	2026-09-13 05:13:39.525645+00
26	Migration20260913113039_sales	2026-09-13 11:49:41.753488+00
\.


--
-- Data for Name: mikro_orm_migrations_scheduler; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_scheduler (id, name, executed_at) FROM stdin;
1	Migration20260123104444	2026-09-13 05:13:39.774117+00
2	Migration20260126100000	2026-09-13 05:13:39.798502+00
3	Migration20260126143000	2026-09-13 05:13:39.813543+00
4	Migration20260913113042_scheduler	2026-09-13 11:49:41.993079+00
\.


--
-- Data for Name: mikro_orm_migrations_shipping_carriers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_shipping_carriers (id, name, executed_at) FROM stdin;
1	Migration20260305170000	2026-09-13 05:13:39.857366+00
2	Migration20260412123000	2026-09-13 05:13:39.876759+00
3	Migration20260618173616_shipping_carriers	2026-09-13 05:13:39.890368+00
4	Migration20260913113045_shipping_carriers	2026-09-13 11:49:42.210564+00
\.


--
-- Data for Name: mikro_orm_migrations_staff; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_staff (id, name, executed_at) FROM stdin;
1	Migration20260121082330	2026-09-13 05:13:39.971158+00
2	Migration20260121131015	2026-09-13 05:13:40.00999+00
3	Migration20260121141954	2026-09-13 05:13:40.078421+00
4	Migration20260121174749	2026-09-13 05:13:40.113649+00
5	Migration20260326135612	2026-09-13 05:13:40.137776+00
6	Migration20260413102715	2026-09-13 05:13:40.187748+00
7	Migration20260413111602	2026-09-13 05:13:40.206648+00
8	Migration20260511112759	2026-09-13 05:13:40.222651+00
9	Migration20260913113046_staff	2026-09-13 11:49:42.400663+00
\.


--
-- Data for Name: mikro_orm_migrations_sync_excel; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_sync_excel (id, name, executed_at) FROM stdin;
1	Migration20260329181120_sync_excel	2026-09-13 05:13:40.328373+00
2	Migration20260913113047_sync_excel	2026-09-13 11:49:42.548805+00
\.


--
-- Data for Name: mikro_orm_migrations_translations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_translations (id, name, executed_at) FROM stdin;
1	Migration20260215120000	2026-09-13 05:13:40.480236+00
2	Migration20260913113047_translations	2026-09-13 11:49:42.720344+00
\.


--
-- Data for Name: mikro_orm_migrations_warranty_claims; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_warranty_claims (id, name, executed_at) FROM stdin;
1	Migration20260703191537_warranty_claims	2026-09-13 05:13:40.634781+00
2	Migration20260704115605_warranty_claims	2026-09-13 05:13:40.783396+00
3	Migration20260704230000_warranty_claims	2026-09-13 05:13:40.827668+00
4	Migration20260705121601_warranty_claims	2026-09-13 05:13:40.848146+00
5	Migration20260709120000_warranty_claims	2026-09-13 05:13:40.928312+00
6	Migration20260710023607_warranty_claims	2026-09-13 05:13:40.960811+00
7	Migration20260716203936_warranty_claims	2026-09-13 05:13:40.991613+00
8	Migration20260717150000_warranty_claims	2026-09-13 05:13:41.007756+00
9	Migration20260719120000_warranty_claims	2026-09-13 05:13:41.039108+00
10	Migration20260813103053_warranty_claims	2026-09-13 05:13:41.057169+00
11	Migration20260913113048_warranty_claims	2026-09-13 11:49:42.90011+00
\.


--
-- Data for Name: mikro_orm_migrations_webhooks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_webhooks (id, name, executed_at) FROM stdin;
1	Migration20260318125247	2026-09-13 05:13:41.140884+00
2	Migration20260323132233	2026-09-13 05:13:41.193996+00
3	Migration20260617141327_webhooks	2026-09-13 05:13:41.214752+00
4	Migration20260913113048_webhooks	2026-09-13 11:49:43.054328+00
\.


--
-- Data for Name: mikro_orm_migrations_wms; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_wms (id, name, executed_at) FROM stdin;
1	Migration20260428110546	2026-09-13 05:13:41.292099+00
2	Migration20260527120000	2026-09-13 05:13:41.346342+00
3	Migration20260527140000	2026-09-13 05:13:41.35623+00
4	Migration20260613120000	2026-09-13 05:13:41.36818+00
5	Migration20260616090000	2026-09-13 05:13:41.380117+00
6	Migration20260707180000	2026-09-13 05:13:41.388655+00
7	Migration20260829000001	2026-09-13 05:13:41.408892+00
8	Migration20260913113049_wms	2026-09-13 11:49:43.195047+00
\.


--
-- Data for Name: mikro_orm_migrations_workflows; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mikro_orm_migrations_workflows (id, name, executed_at) FROM stdin;
1	Migration20251207131955	2026-09-13 05:13:41.634575+00
2	Migration20260109161731	2026-09-13 05:13:41.680992+00
3	Migration20260109163700	2026-09-13 05:13:41.69805+00
4	Migration20260123143500	2026-09-13 05:13:41.736676+00
5	Migration20260222205305	2026-09-13 05:13:41.750684+00
6	Migration20260414120000	2026-09-13 05:13:41.759873+00
7	Migration20260428102318	2026-09-13 05:13:41.768054+00
8	Migration20260602120000	2026-09-13 05:13:41.779321+00
9	Migration20260715120000	2026-09-13 05:13:41.79283+00
10	Migration20260716120000	2026-09-13 05:13:41.801919+00
11	Migration20260913113049_workflows	2026-09-13 11:49:43.313987+00
\.


--
-- Name: mikro_orm_migrations_ai_assistant_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_ai_assistant_id_seq', 12, true);


--
-- Name: mikro_orm_migrations_api_keys_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_api_keys_id_seq', 5, true);


--
-- Name: mikro_orm_migrations_attachments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_attachments_id_seq', 7, true);


--
-- Name: mikro_orm_migrations_audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_audit_logs_id_seq', 6, true);


--
-- Name: mikro_orm_migrations_auth_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_auth_id_seq', 13, true);


--
-- Name: mikro_orm_migrations_business_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_business_rules_id_seq', 6, true);


--
-- Name: mikro_orm_migrations_catalog_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_catalog_id_seq', 27, true);


--
-- Name: mikro_orm_migrations_checkout_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_checkout_id_seq', 5, true);


--
-- Name: mikro_orm_migrations_communication_channels_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_communication_channels_id_seq', 6, true);


--
-- Name: mikro_orm_migrations_configs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_configs_id_seq', 4, true);


--
-- Name: mikro_orm_migrations_currencies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_currencies_id_seq', 8, true);


--
-- Name: mikro_orm_migrations_customer_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_customer_accounts_id_seq', 6, true);


--
-- Name: mikro_orm_migrations_customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_customers_id_seq', 24, true);


--
-- Name: mikro_orm_migrations_dashboards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dashboards_id_seq', 2, true);


--
-- Name: mikro_orm_migrations_data_sync_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_data_sync_id_seq', 3, true);


--
-- Name: mikro_orm_migrations_dermat_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_accounts_id_seq', 7, true);


--
-- Name: mikro_orm_migrations_dermat_bom_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_bom_id_seq', 8, true);


--
-- Name: mikro_orm_migrations_dermat_boms_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_boms_id_seq', 3, true);


--
-- Name: mikro_orm_migrations_dermat_customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_customers_id_seq', 1, true);


--
-- Name: mikro_orm_migrations_dermat_departments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_departments_id_seq', 2, true);


--
-- Name: mikro_orm_migrations_dermat_lists_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_lists_id_seq', 1, true);


--
-- Name: mikro_orm_migrations_dermat_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_orders_id_seq', 6, true);


--
-- Name: mikro_orm_migrations_dermat_planning_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_planning_id_seq', 2, true);


--
-- Name: mikro_orm_migrations_dermat_pm_master_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_pm_master_id_seq', 1, true);


--
-- Name: mikro_orm_migrations_dermat_production_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_production_id_seq', 1, true);


--
-- Name: mikro_orm_migrations_dermat_purchase_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_purchase_id_seq', 3, true);


--
-- Name: mikro_orm_migrations_dermat_purchase_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_purchase_orders_id_seq', 1, true);


--
-- Name: mikro_orm_migrations_dermat_qc_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_qc_id_seq', 1, true);


--
-- Name: mikro_orm_migrations_dermat_quality_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_quality_id_seq', 3, true);


--
-- Name: mikro_orm_migrations_dermat_rm_master_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_rm_master_id_seq', 1, true);


--
-- Name: mikro_orm_migrations_dermat_rnd_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_rnd_id_seq', 1, true);


--
-- Name: mikro_orm_migrations_dermat_sampling_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_sampling_id_seq', 2, true);


--
-- Name: mikro_orm_migrations_dermat_store_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_store_id_seq', 1, true);


--
-- Name: mikro_orm_migrations_dermat_vendors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_vendors_id_seq', 1, true);


--
-- Name: mikro_orm_migrations_dermat_workflow_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dermat_workflow_id_seq', 3, true);


--
-- Name: mikro_orm_migrations_devices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_devices_id_seq', 5, true);


--
-- Name: mikro_orm_migrations_dictionaries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_dictionaries_id_seq', 4, true);


--
-- Name: mikro_orm_migrations_directory_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_directory_id_seq', 5, true);


--
-- Name: mikro_orm_migrations_entities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_entities_id_seq', 6, true);


--
-- Name: mikro_orm_migrations_eudr_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_eudr_id_seq', 4, true);


--
-- Name: mikro_orm_migrations_example_customers_sync_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_example_customers_sync_id_seq', 3, true);


--
-- Name: mikro_orm_migrations_example_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_example_id_seq', 5, true);


--
-- Name: mikro_orm_migrations_feature_toggles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_feature_toggles_id_seq', 4, true);


--
-- Name: mikro_orm_migrations_inbox_ops_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_inbox_ops_id_seq', 6, true);


--
-- Name: mikro_orm_migrations_integrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_integrations_id_seq', 4, true);


--
-- Name: mikro_orm_migrations_manufacturing_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_manufacturing_id_seq', 5, true);


--
-- Name: mikro_orm_migrations_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_messages_id_seq', 6, true);


--
-- Name: mikro_orm_migrations_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_notifications_id_seq', 10, true);


--
-- Name: mikro_orm_migrations_onboarding_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_onboarding_id_seq', 7, true);


--
-- Name: mikro_orm_migrations_payment_gateways_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_payment_gateways_id_seq', 7, true);


--
-- Name: mikro_orm_migrations_perspectives_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_perspectives_id_seq', 3, true);


--
-- Name: mikro_orm_migrations_planner_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_planner_id_seq', 3, true);


--
-- Name: mikro_orm_migrations_progress_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_progress_id_seq', 3, true);


--
-- Name: mikro_orm_migrations_purchasing_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_purchasing_id_seq', 3, true);


--
-- Name: mikro_orm_migrations_push_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_push_notifications_id_seq', 3, true);


--
-- Name: mikro_orm_migrations_query_index_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_query_index_id_seq', 8, true);


--
-- Name: mikro_orm_migrations_resources_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_resources_id_seq', 4, true);


--
-- Name: mikro_orm_migrations_sales_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_sales_id_seq', 26, true);


--
-- Name: mikro_orm_migrations_scheduler_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_scheduler_id_seq', 4, true);


--
-- Name: mikro_orm_migrations_shipping_carriers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_shipping_carriers_id_seq', 4, true);


--
-- Name: mikro_orm_migrations_staff_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_staff_id_seq', 9, true);


--
-- Name: mikro_orm_migrations_sync_excel_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_sync_excel_id_seq', 2, true);


--
-- Name: mikro_orm_migrations_translations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_translations_id_seq', 2, true);


--
-- Name: mikro_orm_migrations_warranty_claims_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_warranty_claims_id_seq', 11, true);


--
-- Name: mikro_orm_migrations_webhooks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_webhooks_id_seq', 4, true);


--
-- Name: mikro_orm_migrations_wms_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_wms_id_seq', 8, true);


--
-- Name: mikro_orm_migrations_workflows_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.mikro_orm_migrations_workflows_id_seq', 11, true);


--
-- PostgreSQL database dump complete
--

\unrestrict xDABYrLy8lNCsBlZCbbZmlAgJBsxB27FYDxkM4WccblpYLFKqDkigzLdUcrf1Wb

