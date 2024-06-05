import { Role } from "../../../utils/interface";

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

type AccountItemProps = {
    accounts: Account[];
    account: Account;
};
const AccountItem = ({ accounts, account }: AccountItemProps) => {
    return (
        <tr>
            <td width="50px">{accounts.indexOf(account) + 1}</td>
            <td width="300px">{account.id}</td>
            <td width="150px">{account.username}</td>
            <td width="150px">{account.email}</td>
            <td width="150px">********</td>
            <td width="150px">
                {new Date(account.created_at).toLocaleDateString("en-GB")}
            </td>
        </tr>
    );
};

export default AccountItem;
