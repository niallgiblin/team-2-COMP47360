#!/bin/bash

# Database monitoring script for Urban Gala
# This script checks database performance and connection usage

echo "=== Urban Gala Database Monitor ==="
echo "Timestamp: $(date)"
echo ""

# Check if database container is running
if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "urban-gala-db"; then
    echo "✅ Database container is running"
    
    # Try to connect with different methods
    echo ""
    echo "=== Testing Database Connection ==="
    
    # Method 1: Try with root user
    echo "Testing with root user..."
    if docker exec urban-gala-db mysql -u root -p${MYSQL_ROOT_PASSWORD:-rootpass} -e "SELECT 1;" 2>/dev/null; then
        echo "✅ Connected with root user"
        DB_USER="root"
        DB_PASS="${MYSQL_ROOT_PASSWORD:-rootpass}"
    else
        echo "❌ Root connection failed"
        # Method 2: Try with urbanuser and default password
        echo "Testing with urbanuser..."
        if docker exec urban-gala-db mysql -u urbanuser -purbanpass -e "SELECT 1;" 2>/dev/null; then
            echo "✅ Connected with urbanuser"
            DB_USER="urbanuser"
            DB_PASS="urbanpass"
        else
            echo "❌ urbanuser connection failed"
            # Method 3: Try without password
            echo "Testing without password..."
            if docker exec urban-gala-db mysql -u urbanuser -e "SELECT 1;" 2>/dev/null; then
                echo "✅ Connected without password"
                DB_USER="urbanuser"
                DB_PASS=""
            else
                echo "❌ All connection methods failed"
                DB_USER=""
                DB_PASS=""
            fi
        fi
    fi
    
    if [ ! -z "$DB_USER" ]; then
        echo ""
        echo "=== Database Connection Status ==="
        docker exec urban-gala-db mysql -u $DB_USER ${DB_PASS:+-p$DB_PASS} -e "
        SELECT 
            'Current Connections' as Metric,
            COUNT(*) as Value
        FROM information_schema.PROCESSLIST 
        WHERE COMMAND != 'Sleep'
        UNION ALL
        SELECT 
            'Max Connections' as Metric,
            @@max_connections as Value
        UNION ALL
        SELECT 
            'Connection Usage %' as Metric,
            ROUND((COUNT(*) / @@max_connections) * 100, 2) as Value
        FROM information_schema.PROCESSLIST 
        WHERE COMMAND != 'Sleep';" 2>/dev/null || echo "❌ Cannot get connection stats"
        
        echo ""
        echo "=== Database Performance ==="
        docker exec urban-gala-db mysql -u $DB_USER ${DB_PASS:+-p$DB_PASS} -e "
        SHOW STATUS LIKE 'Threads_connected';
        SHOW STATUS LIKE 'Threads_running';
        SHOW STATUS LIKE 'Queries';
        SHOW STATUS LIKE 'Slow_queries';
        SHOW STATUS LIKE 'Innodb_buffer_pool_read_requests';
        SHOW STATUS LIKE 'Innodb_buffer_pool_reads';" 2>/dev/null || echo "❌ Cannot get performance stats"
        
        echo ""
        echo "=== Active Queries ==="
        docker exec urban-gala-db mysql -u $DB_USER ${DB_PASS:+-p$DB_PASS} -e "
        SELECT 
            ID,
            USER,
            HOST,
            DB,
            COMMAND,
            TIME,
            STATE,
            INFO
        FROM information_schema.PROCESSLIST 
        WHERE COMMAND != 'Sleep' 
        ORDER BY TIME DESC 
        LIMIT 10;" 2>/dev/null || echo "❌ Cannot get active queries"
    else
        echo "❌ No working database connection found"
    fi
    
else
    echo "❌ Database container is not running"
fi

echo ""
echo "=== Container Resource Usage ==="
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" | grep urban-gala-db || echo "No database container found" 