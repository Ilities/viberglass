-- Database schema for vibug-receiver
-- PostgreSQL schema for bug reports and PM integrations

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    ticket_system VARCHAR(50) NOT NULL CHECK (ticket_system IN ('jira', 'linear', 'github', 'gitlab', 'azure', 'asana', 'trello', 'monday', 'clickup')),
    credentials JSONB NOT NULL,
    webhook_url VARCHAR(500),
    auto_fix_enabled BOOLEAN DEFAULT false,
    auto_fix_tags TEXT[] DEFAULT '{}',
    custom_field_mappings JSONB DEFAULT '{}',
    repository_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Media assets table
CREATE TABLE media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    url VARCHAR(1000) NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bug reports table
CREATE TABLE bug_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- User-provided fields
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category VARCHAR(100) NOT NULL,
    
    -- Technical metadata (stored as JSONB)
    metadata JSONB NOT NULL,
    
    -- Media references
    screenshot_id UUID NOT NULL REFERENCES media_assets(id),
    recording_id UUID REFERENCES media_assets(id),
    annotations JSONB DEFAULT '[]',
    
    -- Integration fields
    ticket_id VARCHAR(255),
    ticket_url VARCHAR(1000),
    ticket_system VARCHAR(50) NOT NULL CHECK (ticket_system IN ('jira', 'linear', 'github', 'gitlab', 'azure', 'asana', 'trello', 'monday', 'clickup')),
    
    -- Auto-fix fields
    auto_fix_requested BOOLEAN DEFAULT false,
    auto_fix_status VARCHAR(20) CHECK (auto_fix_status IN ('pending', 'in_progress', 'completed', 'failed')),
    pull_request_url VARCHAR(1000),
    
    -- System fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook events table (for audit and retry purposes)
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    ticket_id VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Auto-fix queue table
CREATE TABLE auto_fix_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bug_report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
    ticket_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for better performance
CREATE INDEX idx_bug_reports_project_id ON bug_reports(project_id);
CREATE INDEX idx_bug_reports_timestamp ON bug_reports(timestamp);
CREATE INDEX idx_bug_reports_ticket_id ON bug_reports(ticket_id);
CREATE INDEX idx_bug_reports_auto_fix_status ON bug_reports(auto_fix_status);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed, created_at);
CREATE INDEX idx_auto_fix_queue_status ON auto_fix_queue(status, created_at);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bug_reports_updated_at BEFORE UPDATE ON bug_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();