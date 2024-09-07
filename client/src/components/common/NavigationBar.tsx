import { Nav, Navbar } from "react-bootstrap";
import "../../styles/NavBar.scss";

const navItems = ["shops", "about us", "contact us", "news", "support"];
const NavigationBar = () => {
    return (
        <Navbar bg="gray">
            <Nav className="navbar">
                <Nav.Link href={`/`} className="navbar__item">
                    Home
                </Nav.Link>
                {navItems.map((item, id) => (
                    <Nav.Link
                        key={id}
                        href={`/${item.replace(" ", "-")}`}
                        className="navbar__item"
                    >
                        {item}
                    </Nav.Link>
                ))}
            </Nav>
        </Navbar>
    );
};

export default NavigationBar;
