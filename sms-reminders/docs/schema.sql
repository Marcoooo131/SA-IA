CREATE TABLE app_setting (
	key VARCHAR(80) NOT NULL, 
	value JSON NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_by VARCHAR(80) NOT NULL, 
	PRIMARY KEY (key)
);


CREATE TABLE blocked_number (
	id SERIAL NOT NULL, 
	phone_e164 VARCHAR(20) NOT NULL, 
	reason VARCHAR(255) NOT NULL, 
	source VARCHAR(20) NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	created_by VARCHAR(80) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (phone_e164)
);


CREATE TABLE import_batch (
	id SERIAL NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	created_by VARCHAR(80) NOT NULL, 
	filename VARCHAR(255) NOT NULL, 
	origin VARCHAR(40) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	headers JSON NOT NULL, 
	rows JSON, 
	mapping JSON, 
	summary JSON, 
	committed_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id)
);


CREATE TABLE service_config (
	service VARCHAR(20) NOT NULL, 
	sender_id VARCHAR(40), 
	enabled BOOLEAN NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	updated_by VARCHAR(80) NOT NULL, 
	PRIMARY KEY (service)
);


CREATE TABLE template_slot (
	id SERIAL NOT NULL, 
	service VARCHAR(20) NOT NULL, 
	step VARCHAR(20) NOT NULL, 
	active_version_id INTEGER, 
	PRIMARY KEY (id), 
	UNIQUE (service, step)
);


CREATE TABLE appointment (
	id SERIAL NOT NULL, 
	business_key VARCHAR(255) NOT NULL, 
	external_ref VARCHAR(80), 
	customer_ref VARCHAR(80) NOT NULL, 
	first_name VARCHAR(120) NOT NULL, 
	last_name VARCHAR(120) NOT NULL, 
	phone_raw VARCHAR(40) NOT NULL, 
	phone_e164 VARCHAR(20), 
	phone_valid BOOLEAN NOT NULL, 
	appointment_date DATE NOT NULL, 
	appointment_time TIME WITHOUT TIME ZONE NOT NULL, 
	timezone VARCHAR(40) NOT NULL, 
	appointment_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	service VARCHAR(20), 
	status VARCHAR(20) NOT NULL, 
	cancellation_reason VARCHAR(255), 
	cancelled_at TIMESTAMP WITHOUT TIME ZONE, 
	cancelled_by VARCHAR(80), 
	confirmation VARCHAR(20) NOT NULL, 
	confirmed_at TIMESTAMP WITHOUT TIME ZONE, 
	confirmed_by VARCHAR(80), 
	confirmation_source VARCHAR(20), 
	suspended BOOLEAN NOT NULL, 
	suspension_reason VARCHAR(255), 
	resume_pending BOOLEAN NOT NULL, 
	schedule_revision INTEGER NOT NULL, 
	import_batch_id INTEGER, 
	import_origin VARCHAR(80) NOT NULL, 
	imported_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	created_by VARCHAR(80) NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	last_action VARCHAR(255), 
	last_action_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (business_key), 
	FOREIGN KEY(import_batch_id) REFERENCES import_batch (id) ON DELETE SET NULL
);

CREATE INDEX ix_appointment_appointment_at ON appointment (appointment_at);
CREATE INDEX ix_appointment_confirmation ON appointment (confirmation);
CREATE INDEX ix_appointment_customer_ref ON appointment (customer_ref);
CREATE INDEX ix_appointment_phone_e164 ON appointment (phone_e164);
CREATE INDEX ix_appointment_service ON appointment (service);
CREATE INDEX ix_appointment_status ON appointment (status);

CREATE TABLE template_version (
	id SERIAL NOT NULL, 
	slot_id INTEGER NOT NULL, 
	version INTEGER NOT NULL, 
	body TEXT NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	created_by VARCHAR(80) NOT NULL, 
	activated_at TIMESTAMP WITHOUT TIME ZONE, 
	activated_by VARCHAR(80), 
	PRIMARY KEY (id), 
	UNIQUE (slot_id, version), 
	FOREIGN KEY(slot_id) REFERENCES template_slot (id)
);


CREATE TABLE sms_job (
	id SERIAL NOT NULL, 
	appointment_id INTEGER NOT NULL, 
	revision INTEGER NOT NULL, 
	step VARCHAR(20) NOT NULL, 
	template_step VARCHAR(20) NOT NULL, 
	dedup_key VARCHAR(120) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	status_reason VARCHAR(255), 
	scheduled_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	next_attempt_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	attempts INTEGER NOT NULL, 
	claim_token VARCHAR(64), 
	claimed_at TIMESTAMP WITHOUT TIME ZONE, 
	provider_call_started_at TIMESTAMP WITHOUT TIME ZONE, 
	sent_at TIMESTAMP WITHOUT TIME ZONE, 
	simulated BOOLEAN NOT NULL, 
	provider VARCHAR(40), 
	provider_message_id VARCHAR(120), 
	delivery_status VARCHAR(40), 
	delivery_updated_at TIMESTAMP WITHOUT TIME ZONE, 
	template_version_id INTEGER, 
	sender VARCHAR(40), 
	recipient VARCHAR(20), 
	body TEXT, 
	segments INTEGER, 
	error_code VARCHAR(60), 
	error_message VARCHAR(500), 
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	created_by VARCHAR(80) NOT NULL, 
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(appointment_id) REFERENCES appointment (id) ON DELETE CASCADE, 
	UNIQUE (dedup_key), 
	FOREIGN KEY(template_version_id) REFERENCES template_version (id)
);

CREATE INDEX ix_sms_job_appointment_id ON sms_job (appointment_id);
CREATE INDEX ix_sms_job_due ON sms_job (status, next_attempt_at);
CREATE INDEX ix_sms_job_provider_message_id ON sms_job (provider_message_id);
CREATE INDEX ix_sms_job_status ON sms_job (status);

CREATE TABLE event (
	id SERIAL NOT NULL, 
	at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	actor VARCHAR(80) NOT NULL, 
	kind VARCHAR(60) NOT NULL, 
	appointment_id INTEGER, 
	job_id INTEGER, 
	message VARCHAR(500) NOT NULL, 
	details JSON, 
	PRIMARY KEY (id), 
	FOREIGN KEY(appointment_id) REFERENCES appointment (id) ON DELETE CASCADE, 
	FOREIGN KEY(job_id) REFERENCES sms_job (id) ON DELETE CASCADE
);

CREATE INDEX ix_event_appointment_id ON event (appointment_id);
CREATE INDEX ix_event_at ON event (at);
CREATE INDEX ix_event_kind ON event (kind);

