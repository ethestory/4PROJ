from fastapi import FastAPI

# Initialisation de l'application FastAPI
app = FastAPI(
    title="SUPRSS API",
    description="API pour la gestion de flux RSS",
    version="1.0.0"
)

# Route de test basique
@app.get("/")
async def root():
    return {"message": "SUPRSS API is running!"}

# Route de santé
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "SUPRSS Backend"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
