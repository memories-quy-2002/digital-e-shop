import { useEffect, useState } from "react";
import { Table } from "react-bootstrap";
import { FaUser } from "react-icons/fa6";
import ReactPaginate from "react-paginate";
import axios from "../../../api/axios";
import { Role } from "../../../utils/interface";
import AccountItem from "../../common/admin/AccountItem";
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

const AdminAccountPage = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [itemOffset, setItemOffset] = useState(0);
    const itemsPerPage = 5;
    const endOffset = itemOffset + itemsPerPage;
    const currentAccounts = accounts.slice(itemOffset, endOffset);
    const pageCount = Math.ceil(accounts.length / itemsPerPage);

    const handlePageClick = (event: any) => {
        const newOffset = (event.selected * itemsPerPage) % accounts.length;
        console.log(
            `User requested page number ${event.selected}, which is offset ${newOffset}`
        );
        setItemOffset(newOffset);
    };
    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const response = await axios.get(`/api/users/`);
                if (response.status === 200) {
                    const newAccounts = response.data.accounts.map(
                        (account: any) => {
                            return {
                                ...account,
                                showPassword: false,
                            };
                        }
                    );
                    setAccounts(newAccounts);
                    console.log(response.data.msg);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchOrders();
        return () => {};
    }, []);
    console.log(accounts);
    return (
        <AdminLayout>
            <div className="admin__account">
                <div className="admin__account__title">
                    <h3>ACCOUNTS DASHBOARD</h3>
                </div>
                <div className="admin__account__overview">
                    <h4>Overview</h4>
                    <div className="admin__account__overview__stat">
                        <div className="admin__account__overview__stat__card">
                            <div className="admin__account__overview__stat__card__icon">
                                <i>
                                    <FaUser size={115} />
                                </i>
                            </div>
                            <div>
                                <p>Number of accounts</p>
                                <h3>{accounts.length}</h3>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="admin__account__list">
                    <div className="admin__account__list__search">
                        <div>
                            <h4>List of accounts</h4>
                            <input
                                type="text"
                                name="product"
                                id="product"
                                placeholder="Search order"
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
                                    <th>Email</th>
                                    <th>Password</th>
                                    <th>Date created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentAccounts.map((account) => (
                                    <AccountItem
                                        accounts={accounts}
                                        account={account}
                                    />
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
