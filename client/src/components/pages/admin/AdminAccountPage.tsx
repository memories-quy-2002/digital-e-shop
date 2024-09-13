import { useEffect, useState } from "react";
import { Table } from "react-bootstrap";
import ReactPaginate from "react-paginate";
import axios from "../../../api/axios";
import { Role } from "../../../utils/interface";
import AccountItem from "../../common/admin/AdminAccountItem";
import AdminLayout from "../../layout/AdminLayout";

interface Account {
    id: string;
    email: string;
    password: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: Role;
    created_at: Date;
    showPassword: boolean;
}

const ITEMS_PER_PAGE = 5;

const AdminAccountPage = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [itemOffset, setItemOffset] = useState(0);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [filteredAccounts, setFilteredAccounts] = useState<Account[]>(accounts);
    const endOffset = itemOffset + ITEMS_PER_PAGE;
    const currentAccounts = filteredAccounts.slice(itemOffset, endOffset);
    const pageCount = Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE);

    const handlePageClick = (event: any) => {
        const newOffset = (event.selected * ITEMS_PER_PAGE) % accounts.length;
        // console.log(`User requested page number ${event.selected}, which is offset ${newOffset}`);
        setItemOffset(newOffset);
    };
    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const searchValue = event.target.value;
        setSearchTerm(searchValue);
    };

    // Filter products based on the search term
    useEffect(() => {
        const filtered = accounts.filter((account) => {
            const lowerSearchTerm = searchTerm.toLowerCase();
            return (
                account.id.toLowerCase().includes(lowerSearchTerm) ||
                account.username.toLowerCase().includes(lowerSearchTerm) ||
                account.role.toLowerCase().includes(lowerSearchTerm) ||
                account.email.toLowerCase().includes(lowerSearchTerm)
            );
        });
        setFilteredAccounts(filtered);
        return () => {};
    }, [searchTerm, accounts]);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await axios.get(`/api/users/`);
                if (response.status === 200) {
                    const newAccounts: Account[] = response.data.accounts.map((account: any) => {
                        return {
                            ...account,
                            showPassword: false,
                        };
                    });
                    setAccounts(
                        newAccounts.sort(
                            (a: Account, b: Account) =>
                                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                        )
                    );
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchUsers();
        return () => {};
    }, []);
    // console.log(accounts);
    return (
        <AdminLayout>
            <div className="admin__account">
                <div className="admin__account__list">
                    <div className="admin__account__list__search">
                        <div>
                            <h4>List of accounts</h4>
                            <input
                                type="text"
                                name="product"
                                id="product"
                                placeholder="Search customer"
                                value={searchTerm}
                                onChange={handleSearchChange}
                            />
                        </div>
                    </div>
                    <div className="admin__account__list__table">
                        <Table responsive striped borderless hover>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Account ID</th>
                                    <th>Username</th>
                                    <th>Role</th>
                                    <th>Email</th>
                                    <th>Password</th>
                                    <th>Date created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentAccounts.map((account) => (
                                    <AccountItem accounts={filteredAccounts} account={account} />
                                ))}
                            </tbody>
                        </Table>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                            }}
                        >
                            <ReactPaginate
                                className="shops__container__main__pagination__items"
                                breakLabel="..."
                                nextLabel="Next"
                                onPageChange={handlePageClick}
                                pageRangeDisplayed={5}
                                pageCount={pageCount}
                                previousLabel="Previous"
                                renderOnZeroPageCount={null}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminAccountPage;
