# ===== BUILD STAGE =====
FROM eclipse-temurin:17-jdk-jammy AS builder

WORKDIR /app

# Layer 1: Cache Maven wrapper and dependencies
COPY mvnw ./
COPY .mvn/ .mvn/
COPY pom.xml .
RUN chmod +x mvnw && \
    ./mvnw dependency:go-offline -B

# Layer 2: Build application
COPY src/ ./src/
RUN ./mvnw clean package -DskipTests

# ===== RUNTIME STAGE =====
FROM eclipse-temurin:17-jre-jammy AS runtime
WORKDIR /app

# Copy built artifact
COPY --from=builder /app/target/*.jar app.jar

# Security setup
RUN groupadd -r spring && \
    useradd -r -g spring spring && \
    chown spring:spring /app/app.jar

USER spring

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "--enable-preview", "app.jar"]