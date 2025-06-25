CREATE TABLE IF NOT EXISTS location (
    id INT AUTO_INCREMENT PRIMARY KEY,
    latitude DOUBLE NOT NULL,
    longitude DOUBLE NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    uri VARCHAR(255),
    review FLOAT,
    num_reviews INT,
    is_restaurant BOOLEAN DEFAULT FALSE,
    is_landmark BOOLEAN DEFAULT FALSE,
    is_club BOOLEAN DEFAULT FALSE,
    is_bar BOOLEAN DEFAULT FALSE,
    description TEXT,
    price INT,
    zone VARCHAR(100)
) ENGINE=InnoDB;

-- Load data from CSV (inside the container)
LOAD DATA INFILE '/docker-entrypoint-initdb.d/locations_data_markIV.csv'
INTO TABLE location
FIELDS TERMINATED BY ','
OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(@dummy, latitude, longitude, name, address, uri, 
 @reviews, num_reviews, @loc_type, description, @price_level, zone)
SET 
    review = CAST(REGEXP_SUBSTR(@reviews, '[0-9]+\\.[0-9]+') AS DECIMAL(3,1)),
    is_restaurant = CASE WHEN @loc_type LIKE '%restaurant%' THEN TRUE ELSE FALSE END,
    is_bar = CASE WHEN @loc_type LIKE '%bar%' THEN TRUE ELSE FALSE END,
    is_club = CASE WHEN @loc_type LIKE '%club%' THEN TRUE ELSE FALSE END,
    is_landmark = CASE WHEN @loc_type LIKE '%landmark%' THEN TRUE ELSE FALSE END,
    price = CASE 
        WHEN @price_level LIKE '%very cheap%' THEN 1 
        WHEN @price_level LIKE '%cheap%' THEN 2
        WHEN @price_level LIKE '%moderate%' THEN 3
        WHEN @price_level LIKE '%expensive%' THEN 4
        ELSE 0 
    END;
