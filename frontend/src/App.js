import logo from './logo.svg';
import './App.css';

function App() {
  return (
    <div className="App">
      <h1> SUPRSS - Lecteur de flux RSS</h1>
      <div>
        <h2>Connexion</h2>
        <input placeholder="Nom d'utilisateur" />
        <input placeholder="Mot de passe" type="password"/>
        <button>Se connecter</button>
      </div>
      <h2>Incription</h2>
      <input placeholder="Nom d'utilisateur" />
      <input placeholder="Email" />
      <input placeholder="Mot de passe" type="password"/>
      <button>S'inscrire</button>
    </div>
  );
}

export default App;
