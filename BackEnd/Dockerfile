# ===== BUILD STAGE =====
FROM eclipse-temurin:17-jdk-alpine AS builder

WORKDIR /app

# 1. Copy modern wrapper (3.3.2)
COPY mvnw* ./
COPY .mvn/wrapper/ .mvn/wrapper/

# 2. Verify versions
RUN chmod +x mvnw && \
    ./mvnw --version | grep -E "Apache Maven 3.9.9|Java version: 24"

# 3. Build with latest Maven
COPY pom.xml .
RUN ./mvnw dependency:go-offline -B

COPY src/ ./src/
RUN ./mvnw clean package -DskipTests

# ===== RUNTIME STAGE =====
FROM eclipse-temurin:24-jre-alpine
WORKDIR /app

COPY --from=builder /app/target/*.jar app.jar

# Security
RUN addgroup -S spring && adduser -S spring -G spring \
    && chown spring:spring /app/app.jar
USER spring

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "--enable-preview", "app.jar"]