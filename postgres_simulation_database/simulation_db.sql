--
-- PostgreSQL database dump
--

-- Dumped from database version 16.3
-- Dumped by pg_dump version 16.3

-- Started on 2025-09-30 10:42:09

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 4 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- TOC entry 4841 (class 0 OID 0)
-- Dependencies: 4
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 216 (class 1259 OID 124007)
-- Name: experts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.experts (
    id integer NOT NULL,
    last_name character varying(100) NOT NULL,
    first_name character varying(100) NOT NULL,
    affiliations character varying(255)
);


ALTER TABLE public.experts OWNER TO postgres;

--
-- TOC entry 215 (class 1259 OID 124006)
-- Name: experts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.experts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.experts_id_seq OWNER TO postgres;

--
-- TOC entry 4842 (class 0 OID 0)
-- Dependencies: 215
-- Name: experts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.experts_id_seq OWNED BY public.experts.id;


--
-- TOC entry 4688 (class 2604 OID 124010)
-- Name: experts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.experts ALTER COLUMN id SET DEFAULT nextval('public.experts_id_seq'::regclass);


--
-- TOC entry 4835 (class 0 OID 124007)
-- Dependencies: 216
-- Data for Name: experts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.experts (id, last_name, first_name, affiliations) FROM stdin;
1	Abik	Mounia	ENSIAS
2	baina	salah	ENSIAS
4	Allaki	Driss	INPT
5	Potot	Jérôme	ENSIMAG
3	baina	karim	ENSIAS
8	EL Wahbi	Bouazza	Université Ibn-Tofail
\.


--
-- TOC entry 4843 (class 0 OID 0)
-- Dependencies: 215
-- Name: experts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.experts_id_seq', 8, true);


--
-- TOC entry 4690 (class 2606 OID 124012)
-- Name: experts experts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.experts
    ADD CONSTRAINT experts_pkey PRIMARY KEY (id);


-- Completed on 2025-09-30 10:42:10

--
-- PostgreSQL database dump complete
--

