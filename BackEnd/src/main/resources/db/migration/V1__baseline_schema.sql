-- Flyway V1 baseline schema (DATA-01, D-02/D-04)
-- Captures all 10 JPA entity tables for MySQL 8.
-- Location.id is assigned (no AUTO_INCREMENT); other entities use IDENTITY.

CREATE TABLE location (
    id INTEGER NOT NULL,
    latitude DOUBLE,
    longitude DOUBLE,
    name VARCHAR(255),
    address VARCHAR(255),
    uri VARCHAR(255),
    review FLOAT,
    num_reviews INTEGER,
    is_restaurant BIT(1),
    is_landmark BIT(1),
    is_club BIT(1),
    is_bar BIT(1),
    description VARCHAR(1024),
    price INTEGER,
    zone VARCHAR(255),
    information VARCHAR(1024),
    summary VARCHAR(1000),
    tags VARCHAR(1000),
    PRIMARY KEY (id)
);

CREATE TABLE `user` (
    id INTEGER NOT NULL AUTO_INCREMENT,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    phone_number VARCHAR(255),
    avatar_url VARCHAR(255),
    created_at DATETIME(6),
    updated_at DATETIME(6),
    PRIMARY KEY (id),
    UNIQUE (username),
    UNIQUE (email)
);

CREATE TABLE `plan` (
    id INTEGER NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    created_by INTEGER NOT NULL,
    created_at DATETIME(6),
    PRIMARY KEY (id),
    CONSTRAINT FK_plan_created_by FOREIGN KEY (created_by) REFERENCES `user` (id)
);

CREATE TABLE plan_venue (
    id INTEGER NOT NULL AUTO_INCREMENT,
    plan_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    order_index INTEGER,
    PRIMARY KEY (id),
    CONSTRAINT FK_plan_venue_plan FOREIGN KEY (plan_id) REFERENCES `plan` (id),
    CONSTRAINT FK_plan_venue_location FOREIGN KEY (location_id) REFERENCES location (id)
);

CREATE TABLE plan_shared (
    id INTEGER NOT NULL AUTO_INCREMENT,
    plan_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT FK_plan_shared_plan FOREIGN KEY (plan_id) REFERENCES `plan` (id),
    CONSTRAINT FK_plan_shared_user FOREIGN KEY (user_id) REFERENCES `user` (id)
);

CREATE TABLE favourite (
    id INTEGER NOT NULL AUTO_INCREMENT,
    user_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    liked_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT FK_favourite_user FOREIGN KEY (user_id) REFERENCES `user` (id),
    CONSTRAINT FK_favourite_location FOREIGN KEY (location_id) REFERENCES location (id)
);

CREATE TABLE friend (
    id INTEGER NOT NULL AUTO_INCREMENT,
    timestamp DATETIME(6),
    requester_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    status VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT FK_friend_requester FOREIGN KEY (requester_id) REFERENCES `user` (id),
    CONSTRAINT FK_friend_receiver FOREIGN KEY (receiver_id) REFERENCES `user` (id)
);

CREATE TABLE review (
    id INTEGER NOT NULL AUTO_INCREMENT,
    timestamp DATETIME(6),
    user_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    review_text VARCHAR(255),
    review_value FLOAT,
    PRIMARY KEY (id),
    CONSTRAINT FK_review_user FOREIGN KEY (user_id) REFERENCES `user` (id),
    CONSTRAINT FK_review_location FOREIGN KEY (location_id) REFERENCES location (id)
);

CREATE TABLE shared (
    id INTEGER NOT NULL AUTO_INCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    shared_at DATETIME(6),
    PRIMARY KEY (id),
    CONSTRAINT FK_shared_sender FOREIGN KEY (sender_id) REFERENCES `user` (id),
    CONSTRAINT FK_shared_receiver FOREIGN KEY (receiver_id) REFERENCES `user` (id),
    CONSTRAINT FK_shared_location FOREIGN KEY (location_id) REFERENCES location (id)
);

CREATE TABLE history (
    id INTEGER NOT NULL AUTO_INCREMENT,
    user_id INTEGER NOT NULL,
    location_id INTEGER NOT NULL,
    timestamp DATETIME(6),
    PRIMARY KEY (id),
    CONSTRAINT FK_history_user FOREIGN KEY (user_id) REFERENCES `user` (id),
    CONSTRAINT FK_history_location FOREIGN KEY (location_id) REFERENCES location (id)
);
