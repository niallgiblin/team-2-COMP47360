CREATE TABLE IF NOT EXISTS `location` (
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
LOAD DATA LOCAL INFILE '/docker-entrypoint-initdb.d/locations_data_markIV.csv'
INTO TABLE `location`
FIELDS TERMINATED BY ','
OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(@dummy, latitude, longitude, name, address, uri, 
 @reviews, num_reviews, @loc_type, description, @price_level, zone)
SET
    -- More robustly parse the review score. This finds any number (e.g., '4' or '4.5')
    -- and safely casts it, defaulting to NULL if no number is found.
    review = CAST(REGEXP_SUBSTR(@reviews, '[0-9.]+') AS DECIMAL(3,1)),
    is_restaurant = @loc_type LIKE '%restaurant%',
    is_bar = @loc_type LIKE '%bar%',
    is_club = @loc_type LIKE '%club%',
    is_landmark = @loc_type LIKE '%landmark%',
    price = CASE 
        WHEN LOWER(@price_level) LIKE '%very cheap%' THEN 1 
        WHEN LOWER(@price_level) LIKE '%cheap%' THEN 2
        WHEN LOWER(@price_level) LIKE '%moderate%' OR LOWER(@price_level) LIKE '%mid%' THEN 3
        WHEN LOWER(@price_level) LIKE '%expensive%' THEN 4
        WHEN LOWER(@price_level) LIKE '%very expensive%' OR LOWER(@price_level) LIKE '%luxury%' THEN 5
        ELSE 3 -- Default to moderate if unknown
    END;